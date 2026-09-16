using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class OpeningExporter
{
    public void Export(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Create OurApp Wall Openings");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "wall-opening"))
        {
            try
            {
                var hostSourceId = source.Relationships.String("hostWallId");
                var center = source.Geometry.Point("hostProjectedPoint") ?? source.Geometry.Point("insertionPoint");
                if (hostSourceId == null || center == null || !context.ElementIdsBySourceId.TryGetValue(hostSourceId, out var hostElementId) || context.Document.GetElement(hostElementId) is not Wall hostWall)
                {
                    context.Warn($"Wall opening {source.Id} needs fallback because the host wall could not be resolved.");
                    continue;
                }

                var width = source.Dimensions.Number("width", 1);
                var height = source.Dimensions.Number("height", 2.1);
                var baseOffset = source.Dimensions.Number("baseOffset", 0);
                var angle = context.Mapper.ToRadians(source.Geometry.Number("rotation", 0));
                var halfDx = System.Math.Cos(angle) * width / 2;
                var halfDy = System.Math.Sin(angle) * width / 2;
                var p1 = new ManifestPoint(center.Value.X - halfDx, center.Value.Y - halfDy);
                var p2 = new ManifestPoint(center.Value.X + halfDx, center.Value.Y + halfDy);
                var lower = context.Mapper.ToRevitPoint(p1, baseOffset);
                var upper = context.Mapper.ToRevitPoint(p2, baseOffset + height);
                var opening = context.Document.Create.NewOpening(hostWall, lower, upper);
                context.RegisterElement(source, opening, "native", "Openings");
                ExporterHelpers.Count(context, "Opening", true);
            }
            catch (System.Exception ex)
            {
                context.Warn($"Wall opening {source.Id} needs fallback: {ex.Message}");
            }
        }
        tx.Commit();
    }
}
