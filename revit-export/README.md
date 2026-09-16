# Direct Revit RVT Export

This folder contains the independent Revit Automation AppBundle scaffold for the `Export Revit Project (.RVT) - Beta` workflow.

Runtime architecture:

1. Browser creates a direct `revit-export-v1` manifest from native project data.
2. Server-side APS backend uploads the manifest to APS Object Storage.
3. Server-side APS backend submits a Revit Automation WorkItem.
4. This AppBundle reads the manifest and creates native Revit elements where possible.
5. The AppBundle saves an RVT file and writes a JSON export report.

This workflow does not use IFC, DXF, Model Derivative conversion, or Revit Import code.

## Required Deployment Assets

The following files must be authored with the Revit version matching `APS_REVIT_ENGINE` before deployment:

- `RevitExportAddin/Assets/OurApp_RevitExportTemplate.rte`
- `RevitExportAddin/Assets/Families/OurApp_Door_Single.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Door_Double.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Window_Fixed.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Window_Sliding.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Window_Generic.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Column_Rectangular.rfa`
- `RevitExportAddin/Assets/Families/OurApp_Column_Round.rfa`

Do not replace these with text placeholders in an AppBundle upload. APS Revit Automation needs real Revit template/family binaries.

## Server Environment

- `APS_CLIENT_ID`
- `APS_CLIENT_SECRET`
- `APS_BUCKET_KEY`
- `APS_REGION`
- `APS_REVIT_ENGINE`
- `APS_REVIT_APPBUNDLE_ID`
- `APS_REVIT_ACTIVITY_ID`
- `APS_REVIT_ACTIVITY_ALIAS`
- `APS_REVIT_EXPORT_CALLBACK_URL` optional

