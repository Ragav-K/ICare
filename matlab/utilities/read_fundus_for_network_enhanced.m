function img = read_fundus_for_network_enhanced(filename, imageSize)
%READ_FUNDUS_FOR_NETWORK_ENHANCED Load a fundus image with CLAHE harmonization applied.
%   Mirrors preprocess_fundus.m's illumination-normalization logic but
%   returns an in-memory array (no disk write), so it can be used as an
%   imageDatastore ReadFcn for both training and evaluation. Applying the
%   same normalization on both sides is the point: it reduces the
%   camera/illumination gap between training data (APTOS) and external
%   validation data (Messidor-2) that raw-pixel reading does not correct.

img = imresize(read_fundus_rgb_enhanced(filename), imageSize(1:2));
end
