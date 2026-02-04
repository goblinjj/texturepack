mod atlas_packer;

use atlas_packer::{pack_atlas, SpriteInput, AtlasOutput};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageFormat};
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
    let (width, height) = img.dimensions();

    // Build split points including edges
    let mut y_points: Vec<u32> = vec![0];
    y_points.extend(config.horizontal_lines.iter().map(|l| l.position));
    y_points.push(height);

    let mut x_points: Vec<u32> = vec![0];
    x_points.extend(config.vertical_lines.iter().map(|l| l.position));
    x_points.push(width);

    let mut results = Vec::new();

    // Iterate row by row, then column by column
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_image, remove_colors, split_image, save_image, create_atlas, save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
