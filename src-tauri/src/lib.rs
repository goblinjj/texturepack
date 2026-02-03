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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
