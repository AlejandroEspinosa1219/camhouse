const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

class UpdaterService {
  constructor() {
    this.rootPath = path.resolve(__dirname, '..', '..');
    this.versionFilePath = path.join(this.rootPath, 'version.json');
    this.repoOwner = 'AlejandroEspinosa1219';
    this.repoName = 'camhouse';
    this.branch = 'main';
    this.isUpdating = false;
  }

  getLocalVersion() {
    try {
      if (fs.existsSync(this.versionFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.versionFilePath, 'utf8'));
        return data;
      }
    } catch (e) {
      console.warn('[Updater] Error leyendo version.json local:', e.message);
    }
    return { version: '1.0.0', changelog: 'Versión Inicial' };
  }

  isNewer(currentVer, remoteVer) {
    if (!currentVer || !remoteVer) return false;
    const cParts = String(currentVer).trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const rParts = String(remoteVer).trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(cParts.length, rParts.length); i++) {
      const c = cParts[i] || 0;
      const r = rParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }

  async checkForUpdates() {
    const local = this.getLocalVersion();
    const rawUrl = `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.branch}/version.json?t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(rawUrl, {
        headers: { 'User-Agent': 'CamHouse-Updater-Service' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          success: false,
          updateAvailable: false,
          currentVersion: local.version,
          error: `GitHub devolvió status ${res.status}`
        };
      }

      const remote = await res.json();
      const hasUpdate = this.isNewer(local.version, remote.version);

      return {
        success: true,
        updateAvailable: hasUpdate,
        currentVersion: local.version,
        latestVersion: remote.version,
        changelog: remote.changelog || 'Mejoras y correcciones oficiales.',
        releaseDate: remote.releaseDate || new Date().toISOString().split('T')[0]
      };
    } catch (err) {
      console.warn('[Updater] No se pudo verificar actualización en GitHub:', err.message);
      return {
        success: false,
        updateAvailable: false,
        currentVersion: local.version,
        error: err.message
      };
    }
  }

  async downloadAndApplyUpdate() {
    if (this.isUpdating) {
      throw new Error('Ya hay una actualización en curso.');
    }
    this.isUpdating = true;

    const tempDir = path.join(os.tmpdir(), `camhouse_update_${Date.now()}`);
    const zipPath = path.join(tempDir, 'update.zip');
    const extractDir = path.join(tempDir, 'extracted');

    try {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(extractDir, { recursive: true });

      const zipUrl = `https://github.com/${this.repoOwner}/${this.repoName}/archive/refs/heads/${this.branch}.zip`;
      console.log(`[Updater] Descargando actualización desde: ${zipUrl}`);

      const res = await fetch(zipUrl, {
        headers: { 'User-Agent': 'CamHouse-Updater-Service' }
      });

      if (!res.ok) {
        throw new Error(`Error descargando paquete desde GitHub (Status ${res.status})`);
      }

      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));
      console.log(`[Updater] Paquete descargado con éxito (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);

      // Descomprimir usando comando nativo de Windows (tar o PowerShell)
      await new Promise((resolve, reject) => {
        exec(`tar -xf "${zipPath}" -C "${extractDir}"`, (err) => {
          if (!err) return resolve();
          // Fallback a PowerShell si tar fallara
          exec(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, (err2) => {
            if (err2) return reject(err2);
            resolve();
          });
        });
      });

      // El zip de GitHub descomprime dentro de una carpeta llamada 'camhouse-main'
      const repoFolderName = `${this.repoName}-${this.branch}`;
      let sourceDir = path.join(extractDir, repoFolderName);
      if (!fs.existsSync(sourceDir)) {
        // Si no existe con ese nombre, buscar la primera carpeta dentro de extracted
        const files = fs.readdirSync(extractDir);
        const firstFolder = files.find(f => fs.statSync(path.join(extractDir, f)).isDirectory());
        if (firstFolder) sourceDir = path.join(extractDir, firstFolder);
      }

      console.log(`[Updater] Aplicando archivos actualizados desde: ${sourceDir}`);

      // 1. Copiar carpeta src/
      const srcSource = path.join(sourceDir, 'src');
      const srcDest = path.join(this.rootPath, 'src');
      if (fs.existsSync(srcSource)) {
        this.copyRecursiveSync(srcSource, srcDest);
      }

      // 2. Copiar carpeta public/
      const publicSource = path.join(sourceDir, 'public');
      const publicDest = path.join(this.rootPath, 'public');
      if (fs.existsSync(publicSource)) {
        this.copyRecursiveSync(publicSource, publicDest);
      }

      // 3. Copiar knowledge_base.json si existe
      const kbSource = path.join(sourceDir, 'data', 'knowledge_base.json');
      const kbDest = path.join(this.rootPath, 'data', 'knowledge_base.json');
      if (fs.existsSync(kbSource)) {
        this.safeCopyFileSync(kbSource, kbDest);
      }

      // 4. Copiar version.json
      const verSource = path.join(sourceDir, 'version.json');
      if (fs.existsSync(verSource)) {
        this.safeCopyFileSync(verSource, this.versionFilePath);
      }

      // 5. Copiar package.json si existe
      const pkgSource = path.join(sourceDir, 'package.json');
      const pkgDest = path.join(this.rootPath, 'package.json');
      if (fs.existsSync(pkgSource)) {
        this.safeCopyFileSync(pkgSource, pkgDest);
      }

      console.log('[Updater] ✅ Actualización de código completada con éxito.');

      // Limpiar temporales
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}

      // Programar reinicio suave del servidor
      setTimeout(() => {
        console.log('[Updater] Reiniciando servidor para aplicar cambios...');
        process.exit(0); // El Launcher de Windows o el servicio lo reabre automáticamente en 1 segundo
      }, 1500);

      return {
        success: true,
        message: 'Actualización aplicada con éxito. Reiniciando servidor...'
      };
    } catch (err) {
      console.error('[Updater] Error durante la actualización:', err);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
      this.isUpdating = false;
      throw err;
    }
  }

  safeCopyFileSync(srcPath, destPath) {
    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        console.warn(`[Updater] Archivo en uso protegido por Windows (se conserva el existente): ${destPath}`);
      } else {
        throw err;
      }
    }
  }

  copyRecursiveSync(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyRecursiveSync(srcPath, destPath);
      } else {
        this.safeCopyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = new UpdaterService();
