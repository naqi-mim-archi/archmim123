using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class RailingExporter
{
    public void Export(RevitExportContext context)
    {
        var typeResolver = new RevitTypeResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Railings");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "railing"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var railingType = typeResolver.DefaultRailingType(context, source);
                var loop = ExporterHelpers.PathLoop(context, source);
                if (level == null || railingType == null || loop == null)
                {
                    context.Warn($"Railing {source.Id} needs fallback because a level, railing type, or valid path was unavailable.");
                    continue;
                }
                var railing = Railing.Create(context.Document, loop, railingType.Id, level.Id);
                if (railing == null)
                {
                    context.Warn($"Railing {source.Id} needs fallback because Revit rejected the native railing path.");
                    continue;
                }
                context.RegisterElement(source, railing, "native", "Railings", validation: $"type={railingType.Name}");
                ExporterHelpers.Count(context, "Railing", true);
            }
            catch (System.Exception ex)
            {
                context.Warn($"Railing {source.Id} needs fallback: {ex.Message}");
            }
        }
        tx.Commit();
    }
}
