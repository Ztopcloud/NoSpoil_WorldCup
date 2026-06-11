using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("时差观赛")]
[assembly: AssemblyDescription("时差观赛 Windows desktop launcher")]
[assembly: AssemblyCompany("SCGS.TV")]
[assembly: AssemblyProduct("时差观赛")]
[assembly: AssemblyCopyright("Copyright © SCGS.TV")]
[assembly: AssemblyVersion("0.2.0.0")]
[assembly: AssemblyFileVersion("0.2.0.0")]

namespace NoSpoilWorldCup
{
    internal static class Program
    {
        private const string AppName = "时差观赛";
        private const string AppUrl = "https://scgs.tv/";

        [STAThread]
        private static void Main()
        {
            try
            {
                string extensionDir = ResolveExtensionDirectory();
                if (!StartEdgeApp(extensionDir))
                {
                    MessageBox.Show(
                        "未检测到 Microsoft Edge，将使用默认浏览器打开 scgs.tv。\n\n默认浏览器模式不会自动加载内置净屏助手。",
                        AppName,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    Process.Start(AppUrl);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法打开时差观赛。\n\n" + ex.Message,
                    AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static bool StartEdgeApp(string extensionDir)
        {
            string edgePath = FindEdgePath();
            if (edgePath == null)
            {
                return false;
            }

            if (extensionDir == null)
            {
                MessageBox.Show(
                    "未找到内置净屏助手 extension 文件夹。\n\n请从压缩包完整解压后运行，不要只单独拷贝 时差观赛.exe。",
                    AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }

            string profileDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SCGS.TV",
                "WindowsAppEdgeProfile");
            Directory.CreateDirectory(profileDir);

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = edgePath;
            startInfo.Arguments =
                "--app=\"" + AppUrl + "\" " +
                "--user-data-dir=\"" + profileDir + "\" " +
                BuildExtensionArguments(extensionDir) +
                "--no-first-run";
            startInfo.UseShellExecute = false;

            Process.Start(startInfo);
            return true;
        }

        private static string BuildExtensionArguments(string extensionDir)
        {
            if (extensionDir == null)
            {
                return "";
            }

            return "--disable-extensions-except=\"" + extensionDir + "\" " +
                "--load-extension=\"" + extensionDir + "\" ";
        }

        private static string ResolveExtensionDirectory()
        {
            string appDir = Path.GetDirectoryName(Application.ExecutablePath);
            string[] candidates = new string[]
            {
                Path.Combine(appDir, "extension"),
                Path.GetFullPath(Path.Combine(appDir, "..", "extension")),
                Path.GetFullPath(Path.Combine(appDir, "..", "..", "extension"))
            };

            foreach (string candidate in candidates)
            {
                if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "manifest.json")))
                {
                    return candidate;
                }
            }

            return null;
        }

        private static string FindEdgePath()
        {
            string[] candidates = new string[]
            {
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Microsoft",
                    "Edge",
                    "Application",
                    "msedge.exe"),
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Microsoft",
                    "Edge",
                    "Application",
                    "msedge.exe")
            };

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }
    }
}
