using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Linq;

namespace OurApp.RevitExportAddin;

public static class ManifestReader
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    public static RevitExportManifest Read(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<RevitExportManifest>(json, Options)
            ?? throw new InvalidDataException("Revit export manifest could not be parsed.");
    }
}

public sealed class RevitExportManifest
{
    public string ManifestVersion { get; set; } = "revit-export-v1";
    public string CreatedAt { get; set; } = "";
    public RevitManifestProject Project { get; set; } = new();
    public List<RevitManifestLevel> Levels { get; set; } = new();
    public List<RevitManifestElement> Elements { get; set; } = new();
    public RevitManifestSettings Settings { get; set; } = new();
}

public sealed class RevitManifestProject
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string ProjectCode { get; set; } = "";
    public string UnitSystem { get; set; } = "metric";
    public string SourceLinearUnit { get; set; } = "meters";
    public string CoordinateSystem { get; set; } = "canvas-y-down";
    public string ProjectOriginMode { get; set; } = "internal-origin";
}

public sealed class RevitManifestLevel
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public double Elevation { get; set; }
    public double Height { get; set; }
    public int Order { get; set; }
}

public sealed class RevitManifestSettings
{
    public bool IncludeFurniture { get; set; } = true;
    public bool IncludeAnnotations { get; set; } = true;
    public bool IncludeUnsupportedAsDirectShape { get; set; } = true;
    public bool CreateNativeFamilies { get; set; } = true;
    public bool RunValidation { get; set; } = true;
}

public sealed class RevitManifestElement
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string SourceType { get; set; } = "";
    public string? LevelId { get; set; }
    public string? Label { get; set; }
    public string? SubType { get; set; }
    public string? Category { get; set; }
    public JsonElement Geometry { get; set; }
    public JsonElement Dimensions { get; set; }
    public JsonElement Material { get; set; }
    public JsonElement Relationships { get; set; }
    public JsonElement Metadata { get; set; }
    public string ExportStrategy { get; set; } = "native-or-fallback";
}

public readonly record struct ManifestPoint(double X, double Y);

public static class ManifestJson
{
    public static bool TryGetProperty(this JsonElement element, string name, out JsonElement property)
    {
        if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out property)) return true;
        property = default;
        return false;
    }

    public static string? String(this JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;
    }

    public static double Number(this JsonElement element, string name, double fallback = 0)
    {
        return element.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var value) ? value : fallback;
    }

    public static bool Bool(this JsonElement element, string name, bool fallback = false)
    {
        return element.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.True
            ? true
            : element.TryGetProperty(name, out property) && property.ValueKind == JsonValueKind.False
                ? false
                : fallback;
    }

    public static ManifestPoint? Point(this JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var point) || point.ValueKind != JsonValueKind.Object) return null;
        return new ManifestPoint(point.Number("x"), point.Number("y"));
    }

    public static List<ManifestPoint> Points(this JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var points) || points.ValueKind != JsonValueKind.Array) return new List<ManifestPoint>();
        return points
            .EnumerateArray()
            .Where(point => point.ValueKind == JsonValueKind.Object)
            .Select(point => new ManifestPoint(point.Number("x"), point.Number("y")))
            .ToList();
    }
}
