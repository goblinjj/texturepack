use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops::FilterType, DynamicImage, GenericImage, RgbaImage};
use rectangle_pack::{
    contains_smallest_box, pack_rects, volume_heuristic, GroupedRectsToPlace, RectToInsert,
    TargetBin,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Cursor;

#[derive(Deserialize)]
pub struct SpriteInput {
    pub name: String,
    pub base64: String,
    #[serde(rename = "offsetX", default)]
    pub offset_x: i32,
    #[serde(rename = "offsetY", default)]
    pub offset_y: i32,
}

#[derive(Serialize)]
pub struct AtlasOutput {
    pub image_base64: String,
    pub json: String,
}

#[derive(Serialize)]
struct Pivot {
    x: f32,
    y: f32,
}

#[derive(Serialize)]
struct PhaserFrame {
    frame: FrameRect,
    rotated: bool,
    trimmed: bool,
    #[serde(rename = "spriteSourceSize")]
    sprite_source_size: FrameRect,
    #[serde(rename = "sourceSize")]
    source_size: Size,
    pivot: Pivot,
    #[serde(rename = "offset")]
    offset: Offset,
}

#[derive(Serialize)]
struct Offset {
    x: i32,
    y: i32,
}

#[derive(Serialize)]
struct FrameRect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

#[derive(Serialize)]
struct Size {
    w: u32,
    h: u32,
}

#[derive(Serialize)]
struct PhaserMeta {
    image: String,
    size: Size,
    scale: f32,
}

#[derive(Serialize)]
struct PhaserAtlas {
    frames: BTreeMap<String, PhaserFrame>,
    meta: PhaserMeta,
}

pub fn pack_atlas(sprites: Vec<SpriteInput>, padding: u32) -> Result<AtlasOutput, String> {
    // Decode all images and store offsets
    let mut original_images: Vec<(String, DynamicImage, i32, i32)> = Vec::new();

    for sprite in &sprites {
        let base64_clean = sprite
            .base64
            .strip_prefix("data:image/png;base64,")
            .unwrap_or(&sprite.base64);
        let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        original_images.push((sprite.name.clone(), img, sprite.offset_x, sprite.offset_y));
    }

    if original_images.is_empty() {
        return Err("No images to pack".to_string());
    }

    let max_size = 2048u32;

    // Try with different scale factors: 100%, 90%, 80%, 70%, 60%, 50%, 40%, 30%, 25%, 20%
    let scale_factors = [1.0f32, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2];

    for &scale in &scale_factors {
        // Scale images if needed
        let images: Vec<(String, DynamicImage, i32, i32)> = if scale < 1.0 {
            original_images.iter().map(|(name, img, ox, oy)| {
                let new_width = ((img.width() as f32) * scale).round() as u32;
                let new_height = ((img.height() as f32) * scale).round() as u32;
                let scaled_img = img.resize_exact(
                    new_width.max(1),
                    new_height.max(1),
                    FilterType::Lanczos3
                );
                // Scale offsets proportionally
                let scaled_ox = ((*ox as f32) * scale).round() as i32;
                let scaled_oy = ((*oy as f32) * scale).round() as i32;
                (name.clone(), scaled_img, scaled_ox, scaled_oy)
            }).collect()
        } else {
            original_images.iter().map(|(name, img, ox, oy)| {
                (name.clone(), img.clone(), *ox, *oy)
            }).collect()
        };

        // Prepare rectangles for packing
        let mut rects_to_place: GroupedRectsToPlace<usize, ()> = GroupedRectsToPlace::new();
        for (i, (_, img, _, _)) in images.iter().enumerate() {
            rects_to_place.push_rect(
                i,
                None,
                RectToInsert::new(
                    img.width() + padding * 2,
                    img.height() + padding * 2,
                    1,
                ),
            );
        }

        // Try different bin sizes until we find one that fits
        let mut bin_size = 256u32;

        let pack_result = loop {
            let mut target_bins = BTreeMap::new();
            target_bins.insert(0, TargetBin::new(bin_size, bin_size, 1));

            match pack_rects(
                &rects_to_place,
                &mut target_bins,
                &volume_heuristic,
                &contains_smallest_box,
            ) {
                Ok(placements) => break Some(placements),
                Err(_) => {
                    bin_size *= 2;
                    if bin_size > max_size {
                        break None; // Can't fit at this scale, try smaller
                    }
                }
            }
        };

        // If packing succeeded at this scale
        if let Some(placements) = pack_result {
            // Find actual bounds
            let mut max_x = 0u32;
            let mut max_y = 0u32;

            for (_, (_, loc)) in placements.packed_locations() {
                max_x = max_x.max(loc.x() + loc.width());
                max_y = max_y.max(loc.y() + loc.height());
            }

            // Create output image
            let mut output = RgbaImage::new(max_x, max_y);
            let mut frames = BTreeMap::new();

            for (rect_id, (_, loc)) in placements.packed_locations() {
                let (name, img, offset_x, offset_y) = &images[*rect_id];

                let x = loc.x() + padding;
                let y = loc.y() + padding;
                let w = img.width();
                let h = img.height();

                // Copy image to atlas
                output.copy_from(&img.to_rgba8(), x, y).map_err(|e| e.to_string())?;

                // Add frame to JSON with offset
                frames.insert(
                    name.clone(),
                    PhaserFrame {
                        frame: FrameRect { x, y, w, h },
                        rotated: false,
                        trimmed: false,
                        sprite_source_size: FrameRect { x: 0, y: 0, w, h },
                        source_size: Size { w, h },
                        pivot: Pivot { x: 0.5, y: 0.5 },
                        offset: Offset { x: *offset_x, y: *offset_y },
                    },
                );
            }

            // Encode output image
            let mut buf = Cursor::new(Vec::new());
            output
                .write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| e.to_string())?;
            let image_base64 = format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref()));

            // Generate Phaser JSON
            let atlas = PhaserAtlas {
                frames,
                meta: PhaserMeta {
                    image: "atlas.png".to_string(),
                    size: Size { w: max_x, h: max_y },
                    scale,
                },
            };
            let json = serde_json::to_string_pretty(&atlas).map_err(|e| e.to_string())?;

            return Ok(AtlasOutput { image_base64, json });
        }
    }

    Err("Images too large to pack even at 20% scale".to_string())
}
