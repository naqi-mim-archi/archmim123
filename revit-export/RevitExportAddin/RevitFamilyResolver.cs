using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin;

public sealed class RevitFamilyResolver
{
    public void LoadFamilies(RevitExportContext context, string familyFolder)
    {
        if (!Directory.Exists(familyFolder))
        {
            context.Warn("Revit export family folder was not found. Hosted doors/windows/columns may fall back.");
            return;
        }

        using var tx = new Transaction(context.Document, "Load OurApp Export Families");
        tx.Start();
        foreach (var file in Directory.EnumerateFiles(familyFolder, "*.rfa", SearchOption.TopDirectoryOnly))
        {
            try
            {
                context.Document.LoadFamily(file, out _);
            }
            catch
            {
                context.Warn($"Could not load family {Path.GetFileName(file)}.");
            }
        }
        tx.Commit();
    }

    public FamilySymbol? FindSymbol(RevitExportContext context, string contains)
    {
        var wanted = Normalize(contains);
        foreach (FamilySymbol symbol in new FilteredElementCollector(context.Document)
            .OfClass(typeof(FamilySymbol))
            .Cast<FamilySymbol>()
            .OrderBy(symbol => symbol.FamilyName)
            .ThenBy(symbol => symbol.Name))
        {
            var name = Normalize($"{symbol.FamilyName} {symbol.Name}");
            if (name.Contains(wanted)) return symbol;
        }
        return null;
    }

    public FamilySymbol? FindSymbol(RevitExportContext context, BuiltInCategory category, params string[] preferredNames)
    {
        return FindSymbols(context, category, preferredNames).FirstOrDefault();
    }

    public List<FamilySymbol> FindSymbols(RevitExportContext context, BuiltInCategory category, params string[] preferredNames)
    {
        var categoryId = new ElementId(category).Value;
        var symbols = new FilteredElementCollector(context.Document)
            .OfClass(typeof(FamilySymbol))
            .Cast<FamilySymbol>()
            .Where(symbol => symbol.Category?.Id.Value == categoryId)
            .ToList();
        var ordered = new List<FamilySymbol>();
        foreach (var preferred in preferredNames.Where(name => !string.IsNullOrWhiteSpace(name)))
        {
            var wanted = Normalize(preferred);
            var matches = symbols
                .OrderBy(symbol => symbol.FamilyName)
                .ThenBy(symbol => symbol.Name)
                .Where(symbol => Normalize($"{symbol.FamilyName} {symbol.Name}").Contains(wanted));
            foreach (var match in matches)
            {
                if (ordered.All(symbol => symbol.Id != match.Id)) ordered.Add(match);
            }
        }
        foreach (var symbol in symbols
            .OrderBy(symbol => symbol.FamilyName)
            .ThenBy(symbol => symbol.Name))
        {
            if (ordered.All(item => item.Id != symbol.Id)) ordered.Add(symbol);
        }
        return ordered;
    }

    private static string Normalize(string value)
    {
        return Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9]+", " ").Trim();
    }
}

