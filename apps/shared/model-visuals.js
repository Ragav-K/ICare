export function availableModelVisuals(result) {
  const classifiers = [["resnet50", "ResNet-50"], ["mobilenetv2", "MobileNetV2"]]
    .filter(([key]) => result?.classification?.[key]?.gradCamPath)
    .map(([key, name]) => ({ key, name, kind: "gradcam", note: result.classification[key].gradCamNote }));
  const segmenters = Object.entries(result?.segmentation ?? {})
    .filter(([, model]) => model?.overlayPath)
    .map(([key, model]) => ({ key, name: model.modelName ?? key, kind: "segmentation", note: model.note }));
  return [...classifiers, ...segmenters];
}

export function explainModelVisual(visual) {
  if (visual.kind === "gradcam") {
    return "Warm areas influenced this model's DR grade prediction. This coarse attention map does not confirm a lesion, pinpoint its boundary, or explain its cause.";
  }
  if (visual.key === "vessels") {
    return "Cyan marks vessels proposed by the segmentation model. Compare the overlay with the original photo; these are not confirmed findings.";
  }
  const lesionNames = {
    hardExudates: "hard exudates",
    microaneurysms: "microaneurysms",
    haemorrhages: "haemorrhages",
    softExudates: "soft exudates"
  };
  const lesion = lesionNames[visual.key] ?? "lesions";
  if (/weak|research|demonstration/i.test(visual.note ?? "")) {
    return `Experimental ${lesion} overlay. Red marks are not reliable lesion evidence; compare with the original photo and clinical examination.`;
  }
  return `Red marks candidate ${lesion} from the segmentation model. These regions may be missed or marked incorrectly; confirm against the original photo and clinical examination.`;
}
