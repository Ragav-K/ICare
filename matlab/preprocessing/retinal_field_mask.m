function mask = retinal_field_mask(img)
rgb = im2uint8(img(:, :, 1:min(3, size(img, 3))));
candidate = max(rgb, [], 3) > 12;
components = bwconncomp(candidate, 8);
mask = false(size(candidate));
if components.NumObjects == 0
    return;
end

componentSizes = cellfun(@numel, components.PixelIdxList);
[~, largest] = max(componentSizes);
mask(components.PixelIdxList{largest}) = true;
mask = imfill(mask, "holes");
rimWidth = max(1, round(min(size(mask)) * 0.01));
mask = imerode(mask, strel("disk", rimWidth));
end
