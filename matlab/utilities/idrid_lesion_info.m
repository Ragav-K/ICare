function info = idrid_lesion_info(lesionType)
key = lower(regexprep(string(lesionType), "[^a-zA-Z]", ""));

switch key
    case {"microaneurysm", "microaneurysms", "ma"}
        info = struct("name", "Microaneurysms", "folder", "1. Microaneurysms", "suffix", "_MA");
    case {"haemorrhage", "haemorrhages", "hemorrhage", "hemorrhages", "he"}
        info = struct("name", "Haemorrhages", "folder", "2. Haemorrhages", "suffix", "_HE");
    case {"hardexudate", "hardexudates", "ex", "hard"}
        info = struct("name", "Hard Exudates", "folder", "3. Hard Exudates", "suffix", "_EX");
    case {"softexudate", "softexudates", "se", "soft"}
        info = struct("name", "Soft Exudates", "folder", "4. Soft Exudates", "suffix", "_SE");
    case {"opticdisc", "od", "disc"}
        info = struct("name", "Optic Disc", "folder", "5. Optic Disc", "suffix", "_OD");
    otherwise
        error("ICare:IDRiD:UnknownLesion", "Unknown lesionType '%s'. Use Microaneurysms, Haemorrhages, Hard Exudates, Soft Exudates, or Optic Disc.", lesionType);
end
end
