function ds = lesion_mask_datastore(maskPaths, imageSize)
baseDs = arrayDatastore(cellstr(maskPaths), IterationDimension=1, OutputType="same");
ds = transform(baseDs, @(filename) read_idrid_lesion_mask_categorical(filename, imageSize));
end

function labels = read_idrid_lesion_mask_categorical(filename, imageSize)
mask = read_idrid_lesion_mask(filename, imageSize);
labels = categorical(mask, [false true], ["background", "lesion"]);
end
