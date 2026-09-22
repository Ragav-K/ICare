function report = audit_dataset_usage(dataRoot)
%AUDIT_DATASET_USAGE Report which ICare datasets are used by current trainers.
if nargin < 1 || strlength(string(dataRoot)) == 0
    cfg = icare_config();
    dataRoot = cfg.dataRoot;
end

fprintf("ICare dataset usage audit\n");
fprintf("Data root: %s\n\n", dataRoot);

report = struct();
report.dataRoot = string(dataRoot);

aptos = read_aptos_dataset(dataRoot);
report.aptosSupervisedRows = height(aptos);
fprintf("[USED] APTOS classifier rows: %d labeled images\n", height(aptos));
disp(groupsummary(aptos, "diagnosis"));

drive = read_drive_vessel_dataset(dataRoot);
report.driveVesselRows = height(drive);
fprintf("[USED] DRIVE vessel segmentation rows: %d labeled image/mask pairs\n", height(drive));

lesionTypes = ["Microaneurysms", "Haemorrhages", "Hard Exudates", "Soft Exudates"];
report.idridLesions = struct();
for i = 1:numel(lesionTypes)
    lesionType = lesionTypes(i);
    trainTbl = read_idrid_lesion_dataset(dataRoot, lesionType, "training");
    testTbl = read_idrid_lesion_dataset(dataRoot, lesionType, "testing");
    key = matlab.lang.makeValidName(lesionType);
    report.idridLesions.(key).trainRows = height(trainTbl);
    report.idridLesions.(key).testRows = height(testTbl);
    report.idridLesions.(key).trainMasksPresent = nnz(trainTbl.hasMask);
    report.idridLesions.(key).testMasksPresent = nnz(testTbl.hasMask);
    fprintf("[USED] IDRiD %s: %d train, %d validation/test images\n", lesionType, height(trainTbl), height(testTbl));
end

messidorRoot = fullfile(dataRoot, "Messidor-2");
messidorCsv = fullfile(messidorRoot, "messidor-2.csv");
messidorImages = dir(fullfile(messidorRoot, "IMAGES", "**", "*.png"));
report.messidor2Images = numel(messidorImages);
report.messidor2Csv = string(messidorCsv);
fprintf("[PRESENT, NOT TRAINED] Messidor-2: %d images. Current CSV lists image pairs only, not DR grades.\n", numel(messidorImages));
fprintf("\nQuick mode defaults: false in every trainer. Full trainable datasets are used unless quick=true is passed.\n");
end
