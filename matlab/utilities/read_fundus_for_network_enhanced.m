function img = read_fundus_for_network_enhanced(filename, imageSize)
%READ_FUNDUS_FOR_NETWORK_ENHANCED Load a fundus image with CLAHE harmonization applied.
%   Mirrors preprocess_fundus.m's illumination-normalization logic but
%   returns an in-memory array (no disk write), so it can be used as an
%   imageDatastore ReadFcn for both training and evaluation. Applying the
%   same normalization on both sides is the point: it reduces the
%   camera/illumination gap between training data (APTOS) and external
%   validation data (Messidor-2) that raw-pixel reading does not correct.

img = read_fundus_rgb(filename);

mask = retinal_field_mask(img);
if nnz(mask) / numel(mask) < 0.15
    % Field detection failed (e.g. heavily cropped or non-fundus image);
    % fall back to plain resize rather than erroring out an entire batch.
    img = imresize(img, imageSize(1:2));
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

img = imresize(enhanced, imageSize(1:2));
end
