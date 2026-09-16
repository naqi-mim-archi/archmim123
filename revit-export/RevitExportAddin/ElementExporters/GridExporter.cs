using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class GridExporter
{
    public void Export(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Create OurApp Grids");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "gridline"))
        {
            try
            {
                var curve = ExporterHelpers.CurveFromGeometry(context, source);
                if (curve == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "gridline path missing");
                    continue;
                }
                var grid = curve switch
                {
                    Line line => Grid.Create(context.Document, line),
                    Arc arc => Grid.Create(context.Document, arc),
                    _ => null,
                };
                if (grid == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "gridline curve type is not supported by native Revit grids");
                    continue;
                }
                if (!string.IsNullOrWhiteSpace(source.Label)) grid.Name = source.Label;
                context.RegisterElement(source, grid, "native", "Grids");
                ExporterHelpers.Count(context, "Grid", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }
}
