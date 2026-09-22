function out = preprocess_fundus(imagePath, outputPath)
img = imread(imagePath);
if size(img, 3) ~= 3
    error("ICare:Preprocess:ExpectedRGB", "Fundus enhancement requires an RGB image.");
end
mask = retinal_field_mask(img);
if nnz(mask) / numel(mask) < 0.15
    error("ICare:Preprocess:NoRetinalField", "Retinal field could not be identified.");
end

lab = rgb2lab(img);
lum = lab(:,:,1) / 100;
adjustedLum = adapthisteq(lum, "ClipLimit", 0.005, "NumTiles", [8 8]);
lab(:,:,1) = min(100, max(0, lab(:,:,1) + 35 * (adjustedLum - lum) .* mask));
enhanced = im2uint8(lab2rgb(lab));
for channel = 1:3
    plane = enhanced(:,:,channel);
    source = img(:,:,channel);
    plane(~mask) = source(~mask);
    enhanced(:,:,channel) = plane;
end
imwrite(enhanced, outputPath);
out = outputPath;
end
