using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace CamHouseInstaller
{
    public class InstallerForm : Form
    {
        private Label statusLabel;
        private ProgressBar progressBar;

        public InstallerForm()
        {
            this.Text = "CamHouse By C&A — Instalador Oficial";
            this.Size = new Size(460, 210);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(14, 8, 26);
            this.ForeColor = Color.White;

            Label title = new Label
            {
                Text = "👑 CAMHOUSE BY C&A",
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                ForeColor = Color.FromArgb(216, 180, 254),
                Location = new Point(24, 22),
                AutoSize = true
            };
            this.Controls.Add(title);

            statusLabel = new Label
            {
                Text = "Preparando e instalando todos los componentes en tu PC...",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.White,
                Location = new Point(24, 62),
                Size = new Size(400, 40)
            };
            this.Controls.Add(statusLabel);

            progressBar = new ProgressBar
            {
                Location = new Point(24, 112),
                Size = new Size(396, 26),
                Style = ProgressBarStyle.Continuous,
                Minimum = 0,
                Maximum = 100,
                Value = 5
            };
            this.Controls.Add(progressBar);

            this.Shown += (s, e) => RunInstallationAsync();
        }

        private void RunInstallationAsync()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    string installDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "CamHouseByCA"
                    );

                    // Detener cualquier instancia previa de CamHouse.exe o node.exe para actualizar en limpio al 100%
                    try
                    {
                        foreach (Process p in Process.GetProcessesByName("CamHouse"))
                        {
                            try { p.Kill(); p.WaitForExit(2000); } catch { }
                        }
                        foreach (Process p in Process.GetProcessesByName("node"))
                        {
                            try { p.Kill(); p.WaitForExit(2000); } catch { }
                        }
                        Thread.Sleep(600);
                    }
                    catch { }

                    if (!Directory.Exists(installDir))
                    {
                        Directory.CreateDirectory(installDir);
                    }

                    // Extract embedded payload.zip
                    Assembly asm = Assembly.GetExecutingAssembly();
                    using (Stream resStream = asm.GetManifestResourceStream("payload.zip"))
                    {
                        if (resStream == null)
                        {
                            throw new Exception("No se encontró el paquete integrado payload.zip");
                        }

                        using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                        {
                            int total = archive.Entries.Count;
                            int current = 0;

                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                current++;
                                string fullPath = Path.Combine(installDir, entry.FullName);
                                string dirPath = Path.GetDirectoryName(fullPath);

                                if (!string.IsNullOrEmpty(dirPath) && !Directory.Exists(dirPath))
                                {
                                    Directory.CreateDirectory(dirPath);
                                }

                                if (!string.IsNullOrEmpty(entry.Name))
                                {
                                    try
                                    {
                                        entry.ExtractToFile(fullPath, true);
                                    }
                                    catch { }
                                }

                                if (current % 40 == 0 || current == total)
                                {
                                    int pct = Math.Min(95, (int)((current * 90.0) / Math.Max(1, total)) + 5);
                                    try
                                    {
                                        this.Invoke((MethodInvoker)delegate
                                        {
                                            progressBar.Value = pct;
                                            statusLabel.Text = "Instalando CamHouse By C&A... (" + pct + "%)";
                                        });
                                    }
                                    catch { }
                                }
                            }
                        }
                    }

                    // Create Desktop Shortcut automatically
                    CreateShortcut(installDir);

                    this.Invoke((MethodInvoker)delegate
                    {
                        progressBar.Value = 100;
                        statusLabel.Text = "¡Instalación completada! Abriendo CamHouse By C&A...";
                    });

                    Thread.Sleep(600);

                    string exePath = Path.Combine(installDir, "CamHouse.exe");
                    if (File.Exists(exePath))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = exePath,
                            WorkingDirectory = installDir,
                            UseShellExecute = true
                        });
                    }

                    Environment.Exit(0);
                }
                catch (Exception ex)
                {
                    try
                    {
                        this.Invoke((MethodInvoker)delegate
                        {
                            MessageBox.Show("Error durante la instalación: " + ex.Message, "CamHouse By C&A", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            Environment.Exit(1);
                        });
                    }
                    catch { }
                }
            });
        }

        private void CreateShortcut(string installDir)
        {
            try
            {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktopDir, "CamHouse By C&A.lnk");
                string exePath = Path.Combine(installDir, "CamHouse.exe");
                string icoPath = Path.Combine(installDir, "camhouse.ico");

                string vbsPath = Path.Combine(Path.GetTempPath(), "camhouse_inst_sc.vbs");
                string vbs =
                    "Set oWS = WScript.CreateObject(\"WScript.Shell\")\r\n" +
                    "Set oLink = oWS.CreateShortcut(\"" + shortcutPath + "\")\r\n" +
                    "oLink.TargetPath = \"" + exePath + "\"\r\n" +
                    "oLink.WorkingDirectory = \"" + installDir + "\"\r\n" +
                    "oLink.Description = \"CamHouse By C&A - Centro de Control WhatsApp & IA\"\r\n" +
                    "oLink.IconLocation = \"" + icoPath + "\"\r\n" +
                    "oLink.Save\r\n";

                File.WriteAllText(vbsPath, vbs, System.Text.Encoding.Default);
                Process p = Process.Start(new ProcessStartInfo
                {
                    FileName = "wscript.exe",
                    Arguments = "//B //NoLogo \"" + vbsPath + "\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                if (p != null) p.WaitForExit(3000);
                try { File.Delete(vbsPath); } catch { }
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }
}
