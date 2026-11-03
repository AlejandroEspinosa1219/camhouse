using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace CamHouseLauncher
{
    public class MainForm : Form
    {
        private Process nodeProcess;
        private Label statusLabel;
        private Label subStatusLabel;
        private Button btnOpenApp;
        private Button btnRestart;
        private Button btnStop;
        private System.Windows.Forms.Timer healthTimer;
        private NotifyIcon trayIcon;
        private bool isServerReady = false;
        private bool hasAutoOpened = false;
        private readonly string baseDir;
        private readonly int port = 4000;

        public MainForm()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory;
            InitializeUI();
            StartBackendAsync();
        }

        private void CreateDesktopShortcut()
        {
            try
            {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktopDir, "CamHouse By C&A.lnk");
                string exePath = Path.Combine(baseDir, "CamHouse.exe");
                string icoPath = Path.Combine(baseDir, "camhouse.ico");

                string vbsPath = Path.Combine(Path.GetTempPath(), "create_camhouse_shortcut.vbs");
                string vbsContent =
                    "Set oWS = WScript.CreateObject(\"WScript.Shell\")\r\n" +
                    "Set oLink = oWS.CreateShortcut(\"" + shortcutPath + "\")\r\n" +
                    "oLink.TargetPath = \"" + exePath + "\"\r\n" +
                    "oLink.WorkingDirectory = \"" + baseDir.TrimEnd('\\') + "\"\r\n" +
                    "oLink.Description = \"CamHouse By C&A - Centro de Control WhatsApp & IA\"\r\n" +
                    "oLink.IconLocation = \"" + icoPath + "\"\r\n" +
                    "oLink.Save\r\n";

                File.WriteAllText(vbsPath, vbsContent, System.Text.Encoding.Default);
                Process p = Process.Start(new ProcessStartInfo
                {
                    FileName = "wscript.exe",
                    Arguments = "//B //NoLogo \"" + vbsPath + "\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                if (p != null) p.WaitForExit(3000);
                try { File.Delete(vbsPath); } catch { }

                MessageBox.Show(
                    "¡Acceso directo 'CamHouse By C&A' creado en el Escritorio con éxito! 👑",
                    "CamHouse By C&A",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo crear el acceso directo: " + ex.Message, "Aviso", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void InitializeUI()
        {
            this.Text = "CamHouse By C&A — Motor de Automatización & IA";
            this.Size = new Size(480, 340);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(14, 8, 26);
            this.ForeColor = Color.White;

            string icoPath = Path.Combine(baseDir, "camhouse.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { }
            }

            // Header Panel
            Panel headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 95,
                BackColor = Color.FromArgb(22, 12, 40)
            };

            PictureBox logoBox = new PictureBox
            {
                Size = new Size(64, 64),
                Location = new Point(24, 16),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.Transparent
            };
            string pngIconPath = Path.Combine(baseDir, "public", "img", "app-icon.png");
            if (File.Exists(pngIconPath))
            {
                try { logoBox.Image = Image.FromFile(pngIconPath); } catch { }
            }
            headerPanel.Controls.Add(logoBox);

            Label titleLabel = new Label
            {
                Text = "CAMHOUSE BY C&A",
                Font = new Font("Segoe UI", 15, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(102, 20),
                AutoSize = true
            };
            headerPanel.Controls.Add(titleLabel);

            Label badgeLabel = new Label
            {
                Text = "Centro de Control WhatsApp & IA • Standalone Edition",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(216, 180, 254),
                Location = new Point(104, 50),
                AutoSize = true
            };
            headerPanel.Controls.Add(badgeLabel);

            this.Controls.Add(headerPanel);

            // Status Card
            Panel statusCard = new Panel
            {
                Size = new Size(424, 82),
                Location = new Point(20, 112),
                BackColor = Color.FromArgb(26, 15, 46)
            };

            statusLabel = new Label
            {
                Text = "⏳ Iniciando motor de IA y servidor local...",
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(250, 204, 21),
                Location = new Point(16, 16),
                AutoSize = true
            };
            statusCard.Controls.Add(statusLabel);

            subStatusLabel = new Label
            {
                Text = "Cargando módulos de WhatsApp e Inteligencia Artificial...",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(196, 181, 253),
                Location = new Point(16, 44),
                AutoSize = true
            };
            statusCard.Controls.Add(subStatusLabel);

            this.Controls.Add(statusCard);

            // Primary Action Button: Open App Window
            btnOpenApp = new Button
            {
                Text = "🚀  Abrir Panel de Control CamHouse",
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                Size = new Size(424, 46),
                Location = new Point(20, 208),
                BackColor = Color.FromArgb(168, 85, 247),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnOpenApp.FlatAppearance.BorderSize = 0;
            btnOpenApp.Click += (s, e) => OpenDesktopAppWindow();
            this.Controls.Add(btnOpenApp);

            // Secondary Buttons: Restart, Shortcut & Stop
            btnRestart = new Button
            {
                Text = "🔄 Reiniciar",
                Font = new Font("Segoe UI", 8.8f, FontStyle.Regular),
                Size = new Size(134, 34),
                Location = new Point(20, 262),
                BackColor = Color.FromArgb(38, 24, 64),
                ForeColor = Color.FromArgb(233, 213, 255),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnRestart.FlatAppearance.BorderColor = Color.FromArgb(88, 28, 135);
            btnRestart.Click += (s, e) => RestartBackend();
            this.Controls.Add(btnRestart);

            Button btnShortcut = new Button
            {
                Text = "📌 Crear Icono PC",
                Font = new Font("Segoe UI", 8.8f, FontStyle.Regular),
                Size = new Size(140, 34),
                Location = new Point(162, 262),
                BackColor = Color.FromArgb(38, 24, 64),
                ForeColor = Color.FromArgb(233, 213, 255),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnShortcut.FlatAppearance.BorderColor = Color.FromArgb(88, 28, 135);
            btnShortcut.Click += (s, e) => CreateDesktopShortcut();
            this.Controls.Add(btnShortcut);

            btnStop = new Button
            {
                Text = "🛑 Cerrar Todo",
                Font = new Font("Segoe UI", 8.8f, FontStyle.Regular),
                Size = new Size(134, 34),
                Location = new Point(310, 262),
                BackColor = Color.FromArgb(69, 16, 36),
                ForeColor = Color.FromArgb(254, 205, 211),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnStop.FlatAppearance.BorderColor = Color.FromArgb(159, 18, 57);
            btnStop.Click += (s, e) => ShutdownApplication();
            this.Controls.Add(btnStop);

            // System Tray Icon
            trayIcon = new NotifyIcon
            {
                Text = "CamHouse By C&A — Activo",
                Icon = this.Icon ?? SystemIcons.Application,
                Visible = true
            };
            ContextMenu trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("Abrir Panel CamHouse", (s, e) => OpenDesktopAppWindow());
            trayMenu.MenuItems.Add("Mostrar Ventana de Estado", (s, e) => { this.Show(); this.WindowState = FormWindowState.Normal; this.BringToFront(); });
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Cerrar CamHouse", (s, e) => ShutdownApplication());
            trayIcon.ContextMenu = trayMenu;
            trayIcon.DoubleClick += (s, e) => OpenDesktopAppWindow();

            // Health Check Timer
            healthTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            healthTimer.Tick += CheckServerHealth;
            healthTimer.Start();

            this.FormClosing += OnFormClosing;
        }

        private bool IsPortListening(int checkPort)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", checkPort, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(350));
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        private string ResolveNodeExecutable()
        {
            string bundledNode = Path.Combine(baseDir, "runtime", "node.exe");
            if (File.Exists(bundledNode)) return bundledNode;

            string programFilesNode = @"C:\Program Files\nodejs\node.exe";
            if (File.Exists(programFilesNode)) return programFilesNode;

            return "node.exe";
        }

        private int failureTicks = 0;

        private void StartBackendAsync()
        {
            ThreadPool.QueueUserWorkItem(_ => StartBackendInternal());
        }

        private void StartBackendInternal()
        {
            try
            {
                if (IsPortListening(port))
                {
                    return;
                }

                string nodeExe = ResolveNodeExecutable();
                string entryScript = Path.Combine(baseDir, "src", "server.js");

                if (!File.Exists(entryScript))
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        statusLabel.Text = "❌ Error: No se encontró src\\server.js";
                        statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
                    });
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + entryScript + "\"",
                    WorkingDirectory = baseDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                nodeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
                nodeProcess.OutputDataReceived += (s, e) => { };
                nodeProcess.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrWhiteSpace(e.Data))
                    {
                        try
                        {
                            this.Invoke((MethodInvoker)delegate
                            {
                                subStatusLabel.Text = e.Data.Length > 80 ? e.Data.Substring(0, 80) + "..." : e.Data;
                            });
                        }
                        catch { }
                    }
                };
                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                try
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        statusLabel.Text = "⚠️ Error al iniciar el motor";
                        statusLabel.ForeColor = Color.FromArgb(248, 113, 113);
                        subStatusLabel.Text = ex.Message;
                    });
                }
                catch { }
            }
        }

        private void CheckServerHealth(object sender, EventArgs e)
        {
            bool listening = IsPortListening(port);
            if (listening)
            {
                failureTicks = 0;
                isServerReady = true;
                statusLabel.Text = "🟢 Sistema Activo y Conectado (Puerto 4000)";
                statusLabel.ForeColor = Color.FromArgb(74, 222, 128);
                subStatusLabel.Text = "Bot WhatsApp & OpenAI GPT-4o-mini listos. No cierres esta ventana mientras uses el bot.";

                if (!hasAutoOpened)
                {
                    hasAutoOpened = true;
                    OpenDesktopAppWindow();
                }
            }
            else
            {
                failureTicks++;
                if (failureTicks >= 4 && (nodeProcess == null || nodeProcess.HasExited))
                {
                    failureTicks = 0;
                    statusLabel.Text = "🔄 Levantando servidor local...";
                    statusLabel.ForeColor = Color.FromArgb(250, 204, 21);
                    StartBackendAsync();
                }
            }
        }

        private void OpenDesktopAppWindow()
        {
            string url = "http://localhost:" + port;

            // Try Microsoft Edge or Google Chrome in Native Desktop App Mode (--app=)
            string[] browserCandidates = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
            };

            foreach (string browserPath in browserCandidates)
            {
                if (File.Exists(browserPath))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = browserPath,
                            Arguments = "--app=" + url + " --window-size=1360,860",
                            UseShellExecute = true
                        });
                        return;
                    }
                    catch { }
                }
            }

            // Fallback to default system browser
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private void RestartBackend()
        {
            statusLabel.Text = "🔄 Reiniciando servidor y motor de IA...";
            statusLabel.ForeColor = Color.FromArgb(250, 204, 21);
            isServerReady = false;
            failureTicks = 0;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                StopNodeProcess();
                Thread.Sleep(800);
                StartBackendInternal();
            });
        }

        private void StopNodeProcess()
        {
            try
            {
                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    nodeProcess.Kill();
                    nodeProcess.WaitForExit(3000);
                    nodeProcess.Dispose();
                    nodeProcess = null;
                }
            }
            catch { }

            try
            {
                foreach (Process p in Process.GetProcessesByName("node"))
                {
                    try
                    {
                        string pPath = (p.MainModule != null) ? p.MainModule.FileName : "";
                        if (!string.IsNullOrEmpty(pPath) && pPath.StartsWith(baseDir, StringComparison.OrdinalIgnoreCase))
                        {
                            p.Kill();
                            p.WaitForExit(2000);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private void ShutdownApplication()
        {
            healthTimer.Stop();
            trayIcon.Visible = false;
            StopNodeProcess();
            Environment.Exit(0);
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            ShutdownApplication();
        }

        [STAThread]
        public static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "CamHouse_SingleInstance_Mutex_2026", out createdNew))
            {
                if (!createdNew)
                {
                    // Si ya está abierto en segundo plano, abrir directamente la ventana de la aplicación
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "http://127.0.0.1:4000",
                            UseShellExecute = true
                        });
                    }
                    catch { }
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }
}
