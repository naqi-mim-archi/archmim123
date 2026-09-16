using Autodesk.Revit.DB;
using System.Collections.Generic;
using System.Linq;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class LevelExporter
{
    public void Export(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Create OurApp Levels");
        tx.Start();
        var mappedLevelIds = new HashSet<ElementId>();
        foreach (var source in context.Manifest.Levels)
        {
            var desiredName = string.IsNullOrWhiteSpace(source.Name) ? source.Id : source.Name;
            var elevation = context.Mapper.ToInternalLength(source.Elevation);
            var tolerance = context.Mapper.ToInternalLength(0.002);
            var level = ResolveOrCreateLevel(context, desiredName, elevation, tolerance);
            context.LevelIdsBySourceId[source.Id] = level.Id;
            mappedLevelIds.Add(level.Id);
            var mapping = context.Report.Levels.Find(item => item.SourceLevelId == source.Id);
            if (mapping != null) mapping.RevitLevelId = level.Id.Value.ToString();
        }
        CreateTopLevels(context, mappedLevelIds);
        DeleteUnmappedTemplateLevels(context, mappedLevelIds);
        tx.Commit();
    }

    private static Level ResolveOrCreateLevel(RevitExportContext context, string desiredName, double elevation, double tolerance)
    {
        var level = new FilteredElementCollector(context.Document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(item => item.Name == desiredName)
            ?? new FilteredElementCollector(context.Document)
                .OfClass(typeof(Level))
                .Cast<Level>()
                .FirstOrDefault(item => System.Math.Abs(item.Elevation - elevation) <= tolerance);
        level ??= Level.Create(context.Document, elevation);
        if (System.Math.Abs(level.Elevation - elevation) > tolerance)
        {
            level.Elevation = elevation;
        }
        if (level.Name != desiredName) level.Name = desiredName;
        return level;
    }

    private static void CreateTopLevels(RevitExportContext context, HashSet<ElementId> mappedLevelIds)
    {
        var levels = context.Manifest.Levels.OrderBy(level => level.Order).ToList();
        var tolerance = context.Mapper.ToInternalLength(0.002);
        for (var index = 0; index < levels.Count; index++)
        {
            var source = levels[index];
            if (source.Height <= 0) continue;
            var topElevationMeters = source.Elevation + source.Height;
            var topElevation = context.Mapper.ToInternalLength(topElevationMeters);

            var explicitTopSource = levels.FirstOrDefault(candidate =>
                candidate.Id != source.Id
                && System.Math.Abs(context.Mapper.ToInternalLength(candidate.Elevation) - topElevation) <= tolerance);
            if (explicitTopSource != null && context.LevelIdsBySourceId.TryGetValue(explicitTopSource.Id, out var explicitTopId))
            {
                context.TopLevelIdsBySourceId[source.Id] = explicitTopId;
                mappedLevelIds.Add(explicitTopId);
                continue;
            }

            var desiredName = SuggestedTopLevelName(source, index);
            var topLevel = ResolveOrCreateLevel(context, desiredName, topElevation, tolerance);
            context.TopLevelIdsBySourceId[source.Id] = topLevel.Id;
            mappedLevelIds.Add(topLevel.Id);
        }
    }

    private static string SuggestedTopLevelName(RevitManifestLevel source, int index)
    {
        var trimmed = (source.Name ?? "").Trim();
        if (trimmed.StartsWith("Level ", System.StringComparison.OrdinalIgnoreCase)
            && int.TryParse(trimmed["Level ".Length..], out var levelNumber))
        {
            return $"Level {levelNumber + 1}";
        }
        return $"Level {index + 2}";
    }

    private static void DeleteUnmappedTemplateLevels(RevitExportContext context, HashSet<ElementId> mappedLevelIds)
    {
        var defaultTemplateLevels = new FilteredElementCollector(context.Document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .Where(level => !mappedLevelIds.Contains(level.Id) && IsDefaultTemplateLevelName(level.Name))
            .ToList();

        foreach (var level in defaultTemplateLevels)
        {
            try
            {
                context.Document.Delete(level.Id);
            }
            catch (System.Exception ex)
            {
                context.Warn($"Template level {level.Name} could not be removed: {ex.Message}");
            }
        }
    }

    private static bool IsDefaultTemplateLevelName(string name)
    {
        var trimmed = name.Trim();
        return trimmed.StartsWith("Level ", System.StringComparison.OrdinalIgnoreCase)
            && trimmed.Skip("Level ".Length).All(char.IsDigit);
    }
}
