using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin;

public sealed class CoordinateMapper
{
    private readonly RevitExportManifest _manifest;

    public CoordinateMapper(RevitExportManifest manifest)
    {
        _manifest = manifest;
    }

    public XYZ ToRevitPoint(double sourceX, double sourceY, double sourceZ = 0)
    {
        return new XYZ(ToInternalLength(sourceX), ToInternalLength(-sourceY), ToInternalLength(sourceZ));
    }

    public XYZ ToRevitPoint(ManifestPoint point, double sourceZ = 0)
    {
        return ToRevitPoint(point.X, point.Y, sourceZ);
    }

    public XYZ ToRevitPointAtInternalZ(ManifestPoint point, double internalZ)
    {
        return new XYZ(ToInternalLength(point.X), ToInternalLength(-point.Y), internalZ);
    }

    public double ToInternalLength(double sourceLength)
    {
        return UnitUtils.ConvertToInternalUnits(sourceLength, UnitTypeId.Meters);
    }

    public double ToRadians(double degrees)
    {
        return degrees * System.Math.PI / 180.0;
    }
}
