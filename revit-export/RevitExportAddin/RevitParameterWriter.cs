using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin;

public sealed class RevitParameterWriter
{
    public void WriteDeferredParameters(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Write OurApp Source Parameters");
        tx.Start();
        foreach (var item in context.PendingParameterWrites)
        {
            if (context.Document.GetElement(item.ElementId) is not Element element) continue;
            TrySet(element, "OurApp_ProjectId", context.Manifest.Project.Id);
            TrySet(element, "OurApp_ElementId", item.Source.Id);
            TrySet(element, "OurApp_TypeId", item.Source.SubType ?? "");
            TrySet(element, "OurApp_NativeElementType", item.Source.SourceType);
            TrySet(element, "OurApp_SourceLevelId", item.Source.LevelId ?? "");
            TrySet(element, "OurApp_ExportVersion", context.Manifest.ManifestVersion);
            TrySet(element, "OurApp_ExportedAt", context.Manifest.CreatedAt);
            TrySet(element, "OurApp_MaterialName", item.Source.Material.String("name") ?? "");
            TrySet(element, "OurApp_Width", context.Mapper.ToInternalLength(item.Source.Dimensions.Number("width", 0)));
            TrySet(element, "OurApp_Depth", context.Mapper.ToInternalLength(item.Source.Dimensions.Number("depth", 0)));
            TrySet(element, "OurApp_Height", context.Mapper.ToInternalLength(item.Source.Dimensions.Number("height", 0)));
            TrySet(element, "OurApp_Thickness", context.Mapper.ToInternalLength(item.Source.Dimensions.Number("thickness", 0)));
            TrySet(element, "OurApp_Rotation", item.Source.Dimensions.Number("rotation", 0));
            var ifcGuid = item.Source.Metadata.TryGetProperty("ifcGuid", out var guidElement) && guidElement.ValueKind == System.Text.Json.JsonValueKind.String
                ? guidElement.GetString()
                : "";
            TrySet(element, "OurApp_IfcGuid", ifcGuid ?? "");
        }
        tx.Commit();
    }

    private static void TrySet(Element element, string parameterName, string value)
    {
        var parameter = element.LookupParameter(parameterName);
        if (parameter != null && !parameter.IsReadOnly && parameter.StorageType == StorageType.String) parameter.Set(value);
    }

    private static void TrySet(Element element, string parameterName, double value)
    {
        var parameter = element.LookupParameter(parameterName);
        if (parameter != null && !parameter.IsReadOnly && parameter.StorageType == StorageType.Double) parameter.Set(value);
    }
}

