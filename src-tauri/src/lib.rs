mod atlas_packer;

use atlas_packer::{pack_atlas, SpriteInput, AtlasOutput};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops::FilterType, GenericImageView, ImageFormat};
use std::io::Cursor;
use tauri::command;

#[command]
fn load_image(path: String) -> Result<ImageData, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (width, height) = img.dimensions();

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
    let base64_data = STANDARD.encode(buf.get_ref());

    Ok(ImageData {
        width,
        height,
        base64: format!("data:image/png;base64,{}", base64_data),
    })
}

#[derive(serde::Serialize)]
struct ImageData {
    width: u32,
    height: u32,
    base64: String,
}

#[derive(serde::Deserialize)]
struct ColorToRemove {
    r: u8,
    g: u8,
    b: u8,
    tolerance: u8,
}

#[command]
fn remove_colors(base64_input: String, colors: Vec<ColorToRemove>) -> Result<String, String> {
    // Decode base64 (strip data URL prefix if present)
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    let mut img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();

    for (_, _, pixel) in img.enumerate_pixels_mut() {
        for color in &colors {
            let dr = (pixel[0] as i32 - color.r as i32).abs();
            let dg = (pixel[1] as i32 - color.g as i32).abs();
            let db = (pixel[2] as i32 - color.b as i32).abs();
            let distance = ((dr * dr + dg * dg + db * db) as f64).sqrt();

            if distance <= color.tolerance as f64 * 4.42 {  // Scale 0-100 to ~0-442 (max RGB distance)
                pixel[3] = 0; // Set alpha to transparent
                break;
            }
        }
    }

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref())))
}

#[derive(serde::Deserialize)]
struct SplitLine {
    position: u32,
}

#[derive(serde::Deserialize)]
struct SplitConfig {
    horizontal_lines: Vec<SplitLine>,  // y positions
    vertical_lines: Vec<SplitLine>,    // x positions
}

#[command]
fn split_image(base64_input: String, config: SplitConfig) -> Result<Vec<String>, String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;

    // Use lines directly from config (they already include boundaries)
    let y_points: Vec<u32> = config.horizontal_lines.iter().map(|l| l.position).collect();
    let x_points: Vec<u32> = config.vertical_lines.iter().map(|l| l.position).collect();

    let mut results = Vec::new();

    // Iterate row by row, then column by column (within boundaries)
    for row in 0..y_points.len() - 1 {
        for col in 0..x_points.len() - 1 {
            let x = x_points[col];
            let y = y_points[row];
            let w = x_points[col + 1] - x;
            let h = y_points[row + 1] - y;

            let cropped = img.crop_imm(x, y, w, h);
            let mut buf = Cursor::new(Vec::new());
            cropped.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
            results.push(format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref())));
        }
    }

    Ok(results)
}

#[command]
fn save_image(base64_input: String, path: String) -> Result<(), String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
fn create_atlas(sprites: Vec<SpriteInput>, padding: u32) -> Result<AtlasOutput, String> {
    pack_atlas(sprites, padding)
}

#[command]
fn save_file(content: String, path: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct CompressResult {
    base64: String,
    width: u32,
    height: u32,
    size_bytes: usize,
}

#[command]
fn compress_image(base64_input: String, quality: u8, scale: u8) -> Result<CompressResult, String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let (orig_width, orig_height) = img.dimensions();

    // Apply scale
    let new_width = (orig_width as f32 * scale as f32 / 100.0).round() as u32;
    let new_height = (orig_height as f32 * scale as f32 / 100.0).round() as u32;

    let resized = if scale < 100 {
        img.resize_exact(new_width, new_height, FilterType::Lanczos3)
    } else {
        img
    };

    let rgba = resized.to_rgba8();
    let (width, height) = rgba.dimensions();

    // Convert to RGBA pixels for imagequant
    let pixels: Vec<imagequant::RGBA> = rgba
        .pixels()
        .map(|p| imagequant::RGBA::new(p[0], p[1], p[2], p[3]))
        .collect();

    // Use imagequant for color quantization (lossy PNG compression)
    let mut liq = imagequant::new();
    liq.set_quality(0, quality).map_err(|e| e.to_string())?;

    let mut img_liq = liq.new_image(
        pixels,
        width as usize,
        height as usize,
        0.0
    ).map_err(|e| e.to_string())?;

    let mut res = liq.quantize(&mut img_liq).map_err(|e| e.to_string())?;
    res.set_dithering_level(1.0).map_err(|e| e.to_string())?;

    let (palette, indexed_pixels) = res.remapped(&mut img_liq).map_err(|e| e.to_string())?;

    // Encode with lodepng
    let mut encoder = lodepng::Encoder::new();
    encoder.set_auto_convert(false);
    encoder.info_raw_mut().colortype = lodepng::ColorType::PALETTE;
    encoder.info_raw_mut().set_bitdepth(8);
    encoder.info_png_mut().color.colortype = lodepng::ColorType::PALETTE;
    encoder.info_png_mut().color.set_bitdepth(8);

    for color in &palette {
        encoder.info_raw_mut().palette_add(lodepng::RGBA { r: color.r, g: color.g, b: color.b, a: color.a })
            .map_err(|e| e.to_string())?;
        encoder.info_png_mut().color.palette_add(lodepng::RGBA { r: color.r, g: color.g, b: color.b, a: color.a })
            .map_err(|e| e.to_string())?;
    }

    let png_data = encoder.encode(&indexed_pixels, width as usize, height as usize)
        .map_err(|e| e.to_string())?;

    let size_bytes = png_data.len();
    let base64_output = format!("data:image/png;base64,{}", STANDARD.encode(&png_data));

    Ok(CompressResult {
        base64: base64_output,
        width,
        height,
        size_bytes,
    })
}

#[command]
fn get_image_size(base64_input: String) -> Result<usize, String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);
    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    Ok(bytes.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_image, remove_colors, split_image, save_image, create_atlas, save_file,
            compress_image, get_image_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
