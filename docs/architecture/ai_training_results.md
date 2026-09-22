# ICare AI Training Results

## APTOS 2019 DR Classification - ResNet-50 Ordinal Run

Training date: 2026-09-16  
Dataset: APTOS 2019  
Images used: 3,662 labeled training images from `APTOS/train_images` with labels from `APTOS/train.csv`  
Split strategy: stratified train/validation/test split from APTOS training set  
Architecture: ResNet-50 transfer-learning classifier  
Classes: `0`, `1`, `2`, `3`, `4`

### Results

Training summary:

```text
Loss: class-weighted cross-entropy + ordinal severity-distance penalty
Ordinal penalty weight: 0.35
Epochs completed: 20 / 20
Mini-batch size: 16
Best validation accuracy observed: 77.27%
Deployment artifact: resnet50_dr.mat
```

Held-out test metrics saved in `metrics`:

```text
Test accuracy: 76.64%
Macro F1: 60.20%
```

Confusion matrix:

```text
        Pred 0  Pred 1  Pred 2  Pred 3  Pred 4
True 0    263      6       0       0       1
True 1      4     31      11       3       6
True 2      4     13      91      25      17
True 3      0      0       7      16       6
True 4      0      3      11      11      19
```

Per-class F1:

```text
Grade 0: 97.23%
Grade 1: 57.41%
Grade 2: 67.41%
Grade 3: 38.10%
Grade 4: 40.86%
```

### Interpretation

The ordinal run preserves the baseline's overall accuracy while improving macro F1 from 58.65% to 60.20%. It improves the severe minority classes most clearly: grade `3` F1 rose from the previous low baseline range to 38.10%, and grade `4` F1 rose to 40.86%. ResNet-50 remains the primary ICare classifier.

### Next Improvements

- Tune ordinal penalty weight around 0.20-0.50 and select by validation macro F1.
- Consider balanced mini-batches or oversampling for classes `1`, `3`, and `4`.
- Add test-time augmentation and external validation once a labeled external set is available.
- Keep Messidor-2 as external validation only if a usable label file is available.

### Same-Seed Loss Ablation

To separate the effect of longer training from the ordinal penalty, ResNet-50 was rerun with the same seed, split, class weights, 20 epochs, and mini-batch size, but with standard class-weighted cross-entropy only. This ablation was saved separately and did not replace the deployed `resnet50_dr.mat` artifact.

```text
Artifact: resnet50_dr_crossentropy_ablation.mat
Loss: class-weighted cross-entropy
Test accuracy: 76.46%
Macro F1: 60.22%
```

Cross-entropy ablation confusion matrix:

```text
        Pred 0  Pred 1  Pred 2  Pred 3  Pred 4
True 0    264      5       0       0       1
True 1      4     31      14       2       4
True 2      3     15      87      23      22
True 3      0      0       7      15       7
True 4      0      4       7      11      22
```

Per-class F1:

```text
Grade 0: 97.60%
Grade 1: 56.36%
Grade 2: 65.66%
Grade 3: 37.50%
Grade 4: 44.00%
```

Interpretation: the ablation is effectively tied with the ordinal run: `60.22%` macro F1 for cross-entropy versus `60.20%` for ordinal, with ordinal slightly higher accuracy (`76.64%` versus `76.46%`). Therefore, the defensible claim is that the longer 20-epoch retraining with class weights improved the ResNet-50 macro F1 over the original baseline; this single ablation does not prove that the ordinal penalty itself was the source of the gain.

## APTOS 2019 DR Classification - MobileNetV2 Ordinal Run

Training date: 2026-09-16  
Dataset: APTOS 2019  
Architecture: MobileNetV2 transfer-learning classifier  
Purpose: lightweight ICare classifier for lower-resource deployment

### Results

Training summary:

```text
Loss: class-weighted cross-entropy + ordinal severity-distance penalty
Ordinal penalty weight: 0.35
Epochs completed: 20 / 20
Mini-batch size: 16
Best validation accuracy observed: 74.00%
Deployment artifact: mobilenetv2_dr.mat
```

Held-out test metrics saved in `metrics`:

```text
Test accuracy: 72.45%
Macro F1: 55.91%
```

Confusion matrix:

```text
        Pred 0  Pred 1  Pred 2  Pred 3  Pred 4
True 0    257     13       0       0       0
True 1      2     44       8       0       1
True 2      9     30      68      19      24
True 3      0      2       7      15       5
True 4      0      7      13      11      13
```

### Comparison

| Model | Validation Accuracy | Test Accuracy | Macro F1 | Intended Role |
| --- | ---: | ---: | ---: | --- |
| ResNet-50 ordinal | 77.27% | 76.64% | 60.20% | primary classifier |
| ResNet-50 cross-entropy ablation | 76.36% | 76.46% | 60.22% | ablation, not deployed |
| MobileNetV2 ordinal | 74.00% | 72.45% | 55.91% | lightweight low-resource classifier |

ResNet-50 remains the better classifier. The longer 20-epoch retraining gives a modest but useful macro-F1 lift over the original baseline while keeping overall accuracy in the same range. In the same-seed ResNet ablation, ordinal and standard cross-entropy were effectively tied.

## DRIVE Vessel Segmentation - U-Net Baseline

Training date: 2026-09-11  
Dataset: DRIVE  
Architecture: U-Net semantic segmentation  
Purpose: retinal vessel segmentation for ICare explainability and retinal-structure analysis

Dataset note: this local DRIVE copy includes vessel masks for `training/1st_manual`. The `test/mask` folder contains field-of-view masks, not vessel ground truth, so reported Dice/IoU use a held-out split from the labeled training images.

### Results

Training summary:

```text
Epochs: 20 / 20
Iterations: 160 / 160
Hardware: Single CPU
Elapsed time: 24 min 2 sec
Training stopped: Max epochs completed
```

Held-out validation metrics saved in `metrics`:

```text
Mean Dice: 59.25%
Mean IoU: 42.22%
```

### Interpretation

This is a working first vessel-segmentation baseline. Dice/IoU are plausible for a small CPU-trained baseline using only 20 labeled DRIVE images. The model should improve with more augmentation, patch-based training, class balancing, and longer tuning.

## IDRiD Lesion Segmentation - Microaneurysms U-Net Patch/Dice Run

Training date: 2026-09-16  
Dataset: IDRiD A. Segmentation  
Lesion type: Microaneurysms  
Architecture: U-Net semantic segmentation  
Purpose: lesion localization and overlay generation for ICare explainability

### Results

Training summary:

```text
Training images: 54
Validation/test images: 27
Patch training: enabled
Generated patches: 1296
Lesion-positive patches: 1133
Patch validation: enabled
Validation patches: 162
Lesion-positive validation patches: 139
Patch recipe: 24 patches/image, 85% positive target, min 8 positive pixels
Loss: 50% weighted cross-entropy + 50% soft Dice
Mini-batch size: 8
Epochs completed: 20 / 20
Elapsed training time: 20 min 58 sec
Training stopped: Max epochs completed
Final evaluation: native-resolution tiled inference, 256x256 tiles, stride 256
Deployment artifact: unet_lesions_microaneurysms.mat
```

Held-out metrics saved in `metrics`:

```text
Mean Dice: 2.55%
Mean IoU: 1.29%
Optimal threshold: 0.95
```

### Interpretation

This run replaces the original full-image cross-entropy baseline for the deployed microaneurysm model. The patch/Dice recipe plus native-resolution tiled evaluation improved Dice from 0.0644% to 2.55% and IoU from 0.0325% to 1.29%. The change confirms that whole-image downsampling was destroying tiny microaneurysm masks during validation/inference. The absolute score is still low, so this remains a research/training artifact rather than a clinically reliable lesion segmenter.

### Next Improvements

- Try smaller, higher-resolution patches so microaneurysms occupy more pixels.
- Add stronger lesion-preserving augmentation and hard-negative mining.
- Try focal Tversky or focal Dice loss to penalize missed tiny lesions more heavily.
- Train with more patience/lower learning rate after the first validation plateau.

## IDRiD Lesion Segmentation - Hard Exudates U-Net Patch/Dice Tiled Run

Training date: 2026-09-16  
Dataset: IDRiD A. Segmentation  
Lesion type: Hard Exudates  
Architecture: U-Net semantic segmentation

### Results

Training summary:

```text
Training images: 54
Validation/test images: 27
Patch training: enabled
Generated patches: 1296
Lesion-positive patches: 1125
Patch validation: enabled
Validation patches: 162
Lesion-positive validation patches: 141
Patch recipe: 24 patches/image, 85% positive target, min 8 positive pixels
Loss: 50% weighted cross-entropy + 50% soft Dice
Mini-batch size: 8
Epochs completed: 20 / 20
Elapsed training time: 20 min 48 sec
Training stopped: Max epochs completed
Final evaluation: native-resolution tiled inference, 256x256 tiles, stride 256
Deployment artifact: unet_lesions_hard_exudates.mat
```

Held-out metrics saved in `metrics`:

```text
Mean Dice: 46.78%
Mean IoU: 32.80%
Optimal threshold: 0.95
```

### Interpretation

Hard exudate segmentation improved from 22.80% Dice / 14.16% IoU to 46.78% Dice / 32.80% IoU after patch/Dice training and native-resolution tiled evaluation. This is the strongest lesion model in the current ICare pipeline and is suitable as an explainability overlay baseline, while still needing broader validation before clinical use.

## IDRiD Lesion Segmentation - Haemorrhages U-Net Patch/Dice Tiled Run

Training date: 2026-09-16  
Dataset: IDRiD A. Segmentation  
Lesion type: Haemorrhages  
Architecture: U-Net semantic segmentation

### Results

Training summary:

```text
Training images: 54
Validation/test images: 27
Patch training: enabled
Generated patches: 1296
Lesion-positive patches: 1109
Patch validation: enabled
Validation patches: 162
Lesion-positive validation patches: 140
Patch recipe: 24 patches/image, 85% positive target, min 8 positive pixels
Loss: 50% weighted cross-entropy + 50% soft Dice
Mini-batch size: 8
Epochs completed: 9 / 20
Elapsed training time: 9 min 30 sec
Training stopped: Met validation criterion
Final evaluation: native-resolution tiled inference, 256x256 tiles, stride 256
Deployment artifact: unet_lesions_haemorrhages.mat
```

Held-out metrics saved in `metrics`:

```text
Mean Dice: 7.44%
Mean IoU: 4.12%
Optimal threshold: 0.65
```

### Interpretation

Haemorrhage segmentation improved from 0.0178% Dice / 0.0089% IoU to 7.44% Dice / 4.12% IoU with the fixed patch/Dice and native-tiled pipeline. This confirms the earlier full-image evaluation was suppressing real signal, but the absolute score is still too low for reliable lesion localization.

## IDRiD Lesion Segmentation - Soft Exudates U-Net Patch/Dice Tiled Run

Training date: 2026-09-16  
Dataset: IDRiD A. Segmentation  
Lesion type: Soft Exudates  
Architecture: U-Net semantic segmentation

### Results

Training summary:

```text
Training images: 54
Validation/test images: 27
Patch training: enabled
Generated patches: 1296
Lesion-positive patches: 529
Patch validation: enabled
Validation patches: 162
Lesion-positive validation patches: 69
Patch recipe: 24 patches/image, 85% positive target, min 8 positive pixels
Loss: 50% weighted cross-entropy + 50% soft Dice
Mini-batch size: 8
Epochs completed: 9 / 20
Elapsed training time: 8 min 48 sec
Training stopped: Met validation criterion
Final evaluation: native-resolution tiled inference, 256x256 tiles, stride 256
Deployment artifact: unet_lesions_soft_exudates.mat
```

Held-out metrics saved in `metrics`:

```text
Mean Dice: 5.61%
Mean IoU: 3.34%
Optimal threshold: 0.95
```

### Interpretation

Soft exudate segmentation improved from 0.0925% Dice / 0.0468% IoU to 5.61% Dice / 3.34% IoU. The local split has fewer positive masks than the other lesion classes, so this is still research-only, but the fixed pipeline now measures lesion-scale predictions instead of downsampled full-image artifacts.

## Baseline Summary

| Task | Model | Dataset | Metric Summary | Status |
| --- | --- | --- | --- | --- |
| DR classification | ResNet-50 ordinal | APTOS | 76.64% test accuracy, 60.20% macro F1 | primary classifier |
| DR classification | MobileNetV2 ordinal | APTOS | 72.45% test accuracy, 55.91% macro F1 | lightweight baseline |
| Vessel segmentation | U-Net | DRIVE | 59.25% Dice, 42.22% IoU | usable baseline |
| Microaneurysm segmentation | U-Net patch/Dice tiled | IDRiD | 2.55% Dice, 1.29% IoU | improved, still research-only |
| Hard exudate segmentation | U-Net patch/Dice tiled | IDRiD | 46.78% Dice, 32.80% IoU | strongest lesion overlay baseline |
| Haemorrhage segmentation | U-Net patch/Dice tiled | IDRiD | 7.44% Dice, 4.12% IoU | improved, still research-only |
| Soft exudate segmentation | U-Net patch/Dice tiled | IDRiD | 5.61% Dice, 3.34% IoU | improved, still research-only |
