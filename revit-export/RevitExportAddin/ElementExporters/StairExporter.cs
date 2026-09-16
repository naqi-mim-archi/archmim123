using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using RevitStairs = Autodesk.Revit.DB.Architecture.Stairs;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class StairExporter
{
    public void Export(RevitExportContext context)
    {
        foreach (var source in ExporterHelpers.OfType(context, "stair"))
        {
            try
            {
                var baseLevel = context.ResolveLevel(source.LevelId);
                var p1 = source.Geometry.Point("p1");
                var p2 = source.Geometry.Point("p2");
                if (baseLevel == null || p1 == null || p2 == null)
                {
                    context.Warn($"Stair {source.Id} needs fallback because its base level or run path was unavailable.");
                    continue;
                }

                var baseOffset = source.Dimensions.Number("baseOffset", 0);
                var width = context.Mapper.ToInternalLength(source.Dimensions.Number("width", 1.05));
                var height = context.Mapper.ToInternalLength(source.Dimensions.Number("height", 0.9));
                var treadDepth = context.Mapper.ToInternalLength(source.Dimensions.Number("treadLength", 0.3));
                var risers = System.Math.Max(1, (int)System.Math.Round(source.Dimensions.Number("riserCount", source.Dimensions.Number("stepCount", 1))));
                var topLevel = EnsureTopLevel(context, baseLevel, source, height);
                if (topLevel == null)
                {
                    context.Warn($"Stair {source.Id} needs fallback because a valid top level could not be created.");
                    continue;
                }

                ElementId stairsId;
                using (var scope = new StairsEditScope(context.Document, $"Create OurApp Stair {source.Id}"))
                {
                    stairsId = scope.Start(baseLevel.Id, topLevel.Id);
                    using (var tx = new Transaction(context.Document, "Create OurApp Straight Stair Run"))
                    {
                        tx.Start();
                        if (context.Document.GetElement(stairsId) is RevitStairs stairs)
                        {
                            stairs.DesiredRisersNumber = risers;
                            stairs.ActualTreadDepth = treadDepth;
                        }
                        var line = Line.CreateBound(
                            context.Mapper.ToRevitPoint(p1.Value, baseOffset),
                            context.Mapper.ToRevitPoint(p2.Value, baseOffset));
                        var run = StairsRun.CreateStraightRun(context.Document, stairsId, line, StairsRunJustification.Center);
                        run.ActualRunWidth = width;
                        tx.Commit();
                    }
                    scope.Commit(new RevitExportWarningSwallower());
                }
                if (IsInternalStairTopLevel(topLevel))
                {
                    HideLevelInViews(context, topLevel.Id);
                }

                if (context.Document.GetElement(stairsId) is RevitStairs createdStair)
                {
                    var actualTreads = createdStair.GetStairsRuns()
                        .Select(id => context.Document.GetElement(id))
                        .OfType<StairsRun>()
                        .Sum(run => run.ActualTreadsNumber);
                    var sourceStepCount = source.Dimensions.Number("stepCount", source.Dimensions.Number("treadCount", risers));
                    context.RegisterElement(
                        source,
                        createdStair,
                        "native",
                        "Stairs",
                        validation: $"sourceStepCount={sourceStepCount}; actualTreads={actualTreads}; actualRisers={createdStair.ActualRisersNumber}; treadDepth={createdStair.ActualTreadDepth}");
                    ExporterHelpers.Count(context, "Stair", true);
                }
            }
            catch (System.Exception ex)
            {
                context.Warn($"Stair {source.Id} needs fallback: {ex.Message}");
            }
        }
    }

    private static Level? EnsureTopLevel(RevitExportContext context, Level baseLevel, RevitManifestElement source, double height)
    {
        var targetElevation = baseLevel.Elevation + System.Math.Max(height, context.Mapper.ToInternalLength(0.05));
        var existing = new FilteredElementCollector(context.Document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(level => System.Math.Abs(level.Elevation - targetElevation) < context.Mapper.ToInternalLength(0.002));
        if (existing != null) return existing;

        using var tx = new Transaction(context.Document, "Create OurApp Stair Top Level");
        tx.Start();
        var topLevel = Level.Create(context.Document, targetElevation);
        topLevel.Name = $"OurApp Stair Top {source.Id[..System.Math.Min(8, source.Id.Length)]}";
        HideLevelInViews(context, topLevel.Id);
        tx.Commit();
        return topLevel;
    }

    private static bool IsInternalStairTopLevel(Level level)
    {
        return level.Name.StartsWith("OurApp Stair Top", System.StringComparison.OrdinalIgnoreCase);
    }

    private static void HideLevelInViews(RevitExportContext context, ElementId levelId)
    {
        var element = context.Document.GetElement(levelId);
        if (element == null) return;
        var ids = new List<ElementId> { levelId };
        var levelCategoryId = new ElementId(BuiltInCategory.OST_Levels);
        var views = new FilteredElementCollector(context.Document)
            .OfClass(typeof(View))
            .Cast<View>()
            .Where(view => !view.IsTemplate)
            .ToList();

        foreach (var view in views)
        {
            try
            {
                if (view is View3D)
                {
                    view.SetCategoryHidden(levelCategoryId, true);
                    continue;
                }
                if (element.CanBeHidden(view))
                {
                    view.HideElements(ids);
                }
            }
            catch
            {
                // Some system views reject datum visibility changes; the level still remains available for stair constraints.
            }
        }
    }
}

internal sealed class RevitExportWarningSwallower : IFailuresPreprocessor
{
    public FailureProcessingResult PreprocessFailures(FailuresAccessor failuresAccessor)
    {
        failuresAccessor.DeleteAllWarnings();
        return FailureProcessingResult.Continue;
    }
}
