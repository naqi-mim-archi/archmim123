using System;
using System.IO;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;
using OurApp.RevitExportAddin.ElementExporters;

namespace OurApp.RevitExportAddin;

public sealed class RevitExportRunner
{
    public void Run(DesignAutomationData data)
    {
        var application = data.RevitApp;
        var workDir = Directory.GetCurrentDirectory();
        var manifestPath = FindFile(workDir, "revit-export-manifest.json") ?? FindFile(workDir, "manifest.json");
        if (manifestPath == null) throw new InvalidOperationException("Direct Revit export manifest was not found in the Automation work directory.");

        var manifest = ManifestReader.Read(manifestPath);
        var assemblyDir = Path.GetDirectoryName(typeof(RevitExportRunner).Assembly.Location) ?? AppContext.BaseDirectory;
        var assetsDir = FindDirectory(assemblyDir, "Assets") ?? FindDirectory(workDir, "Assets") ?? Path.Combine(assemblyDir, "Assets");
        var outputRvtPath = Path.Combine(workDir, "project.rvt");
        var reportPath = Path.Combine(workDir, "revit-export-report.json");
        var executionLogPath = Path.Combine(workDir, "revit-export-execution.log");
        var templatePath = SelectTemplatePath(assetsDir, manifest);

        using var document = CreateDocument(application, templatePath, manifest);
        var context = new RevitExportContext(document, manifest, reportPath);

        using var group = new TransactionGroup(document, "OurApp Direct RVT Export");
        group.Start();

        new LevelExporter().Export(context);
        new RevitTypeResolver().Prepare(context);
        new RevitFamilyResolver().LoadFamilies(context, Path.Combine(assetsDir, "Families"));
        new GridExporter().Export(context);
        new WallExporter().Export(context);
        new FloorExporter().Export(context);
        new CeilingExporter().Export(context);
        new OpeningExporter().Export(context);
        new DoorWindowExporter().Export(context);
        new ColumnExporter().Export(context);
        new StairExporter().Export(context);
        new RailingExporter().Export(context);
        new RoomExporter().Export(context);
        new DirectShapeExporter().ExportFallbacks(context);
        new AnnotationExporter().Export(context);
        new GroupExporter().Export(context);
        new RevitParameterWriter().WriteDeferredParameters(context);
        new RevitValidationService().Validate(context);

        group.Assimilate();

        var saveOptions = new SaveAsOptions { OverwriteExistingFile = true };
        document.SaveAs(outputRvtPath, saveOptions);
        context.Report.Validation["savedRvt"] = true;
        RevitExportReportWriter.Write(reportPath, context.Report);
        File.WriteAllLines(executionLogPath, new[]
        {
            $"OurApp direct RVT export completed at {DateTime.UtcNow:O}.",
            $"Source elements: {context.Manifest.Elements.Count}",
            $"Revit mappings: {context.Report.ElementMappings.Count}",
            $"Warnings: {context.Report.Warnings.Count}",
            $"Errors: {context.Report.Errors.Count}",
            $"Asset directory exists: {Directory.Exists(assetsDir)}",
            $"Template path: {templatePath ?? "Revit default new project"}",
        });
    }

    private static string? SelectTemplatePath(string assetsDir, RevitExportManifest manifest)
    {
        var unitSystem = (manifest.Project.UnitSystem ?? manifest.Project.SourceLinearUnit ?? "metric").ToLowerInvariant();
        var preferred = unitSystem.Contains("imperial") || unitSystem.Contains("feet") || unitSystem.Contains("inch")
            ? new[]
            {
                Path.Combine(assetsDir, "Templates", "OurApp_Architectural_Imperial.rte"),
                Path.Combine(assetsDir, "OurApp_Architectural_Imperial.rte"),
            }
            : new[]
            {
                Path.Combine(assetsDir, "Templates", "OurApp_Architectural_Metric.rte"),
                Path.Combine(assetsDir, "OurApp_Architectural_Metric.rte"),
            };

        foreach (var path in preferred)
        {
            if (File.Exists(path)) return path;
        }

        var legacyTemplate = Path.Combine(assetsDir, "OurApp_RevitExportTemplate.rte");
        return File.Exists(legacyTemplate) ? legacyTemplate : null;
    }

    private static Document CreateDocument(Application application, string? templatePath, RevitExportManifest manifest)
    {
        if (!string.IsNullOrWhiteSpace(templatePath) && File.Exists(templatePath))
        {
            return application.NewProjectDocument(templatePath);
        }

        var unitSystem = (manifest.Project.UnitSystem ?? manifest.Project.SourceLinearUnit ?? "metric").ToLowerInvariant();
        return application.NewProjectDocument(unitSystem.Contains("imperial") || unitSystem.Contains("feet") || unitSystem.Contains("inch")
            ? UnitSystem.Imperial
            : UnitSystem.Metric);
    }

    private static string? FindFile(string dir, string fileName)
    {
        foreach (var file in Directory.EnumerateFiles(dir, fileName, SearchOption.AllDirectories))
        {
            return file;
        }
        return null;
    }

    private static string? FindDirectory(string dir, string directoryName)
    {
        var direct = Path.Combine(dir, directoryName);
        if (Directory.Exists(direct)) return direct;

        foreach (var candidate in Directory.EnumerateDirectories(dir, directoryName, SearchOption.AllDirectories))
        {
            return candidate;
        }
        return null;
    }
}
