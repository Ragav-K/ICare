function img = read_fundus_rgb_enhanced(filename)
%READ_FUNDUS_RGB_ENHANCED Load a fundus image with CLAHE illumination harmonization.
%   Full-resolution counterpart to read_fundus_for_network_enhanced, meant
%   for use as an imageDatastore ReadFcn ahead of augmentedImageDatastore
%   (which performs its own resize). Applying this same harmonization to
%   both training (APTOS) and external validation (Messidor-2) reduces the
%   camera/illumination gap between sources compared to reading raw pixels.

img = read_fundus_rgb(filename);

mask = retinal_field_mask(img);
if nnz(mask) / numel(mask) < 0.15
    return
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
img = enhanced;
end
