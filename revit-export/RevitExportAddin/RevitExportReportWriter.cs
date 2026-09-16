using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace OurApp.RevitExportAddin;

public static class RevitExportReportWriter
{
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public static void Write(string path, RevitExportReport report)
    {
        report.Status = report.Errors.Count > 0 ? "failed" : report.Warnings.Count > 0 ? "completed_with_warnings" : "completed";
        File.WriteAllText(path, JsonSerializer.Serialize(report, Options));
    }

    public static void WriteFailureReport(string path, Exception exception)
    {
        var report = new RevitExportReport
        {
            ExportVersion = "revit-export-v1",
            Status = "failed",
            ProjectName = "Unknown",
            Errors = new List<string> { exception.ToString() },
        };
        File.WriteAllText(path, JsonSerializer.Serialize(report, Options));
    }
}

public sealed class RevitExportReport
{
    public string ExportVersion { get; set; } = "revit-export-v1";
    public string Status { get; set; } = "failed";
    public string ProjectName { get; set; } = "";
    public int SourceElementCount { get; set; }
    public int RevitElementCount { get; set; }
    public int NativeElementCount { get; set; }
    public int FallbackDirectShapeCount { get; set; }
    public int SkippedElementCount { get; set; }
    public List<RevitLevelMapping> Levels { get; set; } = new();
    public Dictionary<string, int> ClassCounts { get; set; } = new();
    public List<RevitElementMapping> ElementMappings { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public Dictionary<string, object> Validation { get; set; } = new();

    public static RevitExportReport Create(RevitExportManifest manifest)
    {
        var report = new RevitExportReport
        {
            ExportVersion = manifest.ManifestVersion,
            ProjectName = manifest.Project.Name,
            SourceElementCount = manifest.Elements.Count,
        };
        foreach (var level in manifest.Levels)
        {
            report.Levels.Add(new RevitLevelMapping { SourceLevelId = level.Id, Name = level.Name, Elevation = level.Elevation });
        }
        return report;
    }
}

public sealed class RevitLevelMapping
{
    public string SourceLevelId { get; set; } = "";
    public string Name { get; set; } = "";
    public double Elevation { get; set; }
    public string? RevitLevelId { get; set; }
}

public sealed class RevitElementMapping
{
    public string SourceElementId { get; set; } = "";
    public string SourceType { get; set; } = "";
    public string? RevitElementId { get; set; }
    public string? RevitUniqueId { get; set; }
    public List<string> RevitElementIds { get; set; } = new();
    public List<string> RevitUniqueIds { get; set; } = new();
    public string Result { get; set; } = "";
    public string? RevitCategory { get; set; }
    public string? FallbackReason { get; set; }
    public string? Validation { get; set; }
    public string? Warning { get; set; }
    public string? Error { get; set; }
}
