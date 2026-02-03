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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_image, remove_colors])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
