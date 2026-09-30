# AnyCrop

### Crop Anything. Anywhere.

**AnyCrop** is a simple, lightweight image editor for Windows. It is designed for fast image splitting, editing, transparent-background processing, and zero-gap image composition.

No internet connection is required. The desktop build includes its own runtime, so there is nothing else to install.

---

## Features

* Import multiple images at once
* Drag and drop images directly into the editor
* Preserve original pixel dimensions
* Split images with straight lines or freehand paths
* Delete selected regions or entire image layers
* Zoom up to **800%** for detailed editing
* View images at **1:1 pixel scale**
* Split one image into independent pieces
* Move and rearrange individual pieces
* Create horizontal or vertical zero-gap composites
* Automatically remove outer transparent padding
* Export transparent PNG files
* Remove solid-color backgrounds with adjustable tolerance
* Automatically export processed images to the desktop
* Fully local processing — your images stay on your computer

---

## Getting Started

### 1. Launch AnyCrop

Double-click:

`启动任意裁.cmd`

or use the **打开编辑器** shortcut in the desktop **任意裁** folder.

The local save component will start automatically and open AnyCrop in your default browser.

**No internet connection is required.**

> Keep the entire `程序` folder together. The desktop build already includes everything required to run AnyCrop.

You can also open `index.html` directly, but the desktop launcher should be used when you want automatic local saving.

---

## 2. Import Images

You can select multiple images at once or simply drag and drop them into the editor.

Original pixel dimensions are preserved.

The **Asset Preview** panel shows the import order from left to right. This order is also used when automatically stacking multiple images vertically during export.

---

## 3. Split and Delete

Choose **Straight Split** or **Freehand Split**.

For a straight split, start in the blank area outside the image and drag while holding the left mouse button.

* **Straight Split:** displays a live dashed preview from the starting point to the cursor.
* **Freehand Split:** follows the path of the mouse.

You can draw multiple split lines before selecting a region.

To remove a region:

* Select the region and click **Delete**
* Or right-click the region and choose **Delete**

Split lines are editing guides only. They will **not** appear in exported images.

The **×** button on the left removes the entire image layer.

Use **Undo** to restore previous operations.

---

## 4. Zoom and Fine Editing

Use the **+ / −** controls above the canvas to zoom.

Maximum zoom: **800%**

You can also hold **Ctrl** and scroll the mouse wheel to zoom around the cursor position.

When zoomed in, use the canvas scrollbars or the mouse wheel to navigate around the image.

### View Modes

* **1:1** — display the image at its actual pixel size
* **Fit to Canvas** — display the entire editing area

Zooming only changes the editing view. It does **not** reduce the exported image resolution and does not create an undo step.

---

## 5. Zero-Gap Image Composition

After splitting an image, click **Split into Separate Images** to turn each piece into an independent layer.

Select the images you want in the left panel, then choose:

* **Join Horizontally**
* **Join Vertically**

The editor automatically removes the transparent padding around each piece and places the images with **zero spacing**, while preserving their original pixels.

### Restore the Original Position

For angled or irregular pieces, keep the pieces in their original positions and use **Merge at Current Position**.

This preserves:

* Your manually arranged spacing
* Transparent shapes
* Internal transparent holes

Internal transparent areas are **not** filled automatically.

---

## 6. Export

Click **Export Transparent PNG** to export only the image content.

The exported file does not include:

* The editing canvas
* Grid lines
* Split guides
* Unused transparent outer space

### Multiple Images

If multiple visible images have not been merged, AnyCrop automatically stacks them vertically in the same order shown in the Asset Preview panel.

Images are centered and placed with **zero spacing**.

Merged images keep the layout you confirmed in the editor.

When images have different widths, transparent space is preserved on the sides rather than stretching or distorting the images.

### Export Rules

Hidden images and completely transparent images are not exported.

The checkboxes in the left panel control **manual composition only** and do not determine whether an image is exported.

Exporting does not modify your original editable layers.

All exported PNG files are automatically saved to:

`Desktop\任意裁`

If the folder does not exist, AnyCrop creates it automatically.

Files are named using timestamps. Duplicate filenames are automatically numbered instead of overwriting previous exports.

No **Save As** dialog is required.

After export, AnyCrop displays the generated filename and provides an option to open the export folder.

Images processed with **Auto Background Removal** are exported to the same folder.

---

## 7. Transparent Background

Select **Make Transparent**, then choose the background color you want to remove.

You can also use:

**Auto Remove Background for Current Layer**

to remove edge pixels with similar colors and export the result.

### Color Tolerance

Adjust the **Color Tolerance** value to control how much of the background is removed.

This tool works primarily by color. For complex backgrounds, combine it with splitting and erasing for more precise results.

---

## Windows Portable Version

The desktop **AnyCrop** folder contains:

```text
任意裁/
├── PNG/                 Exported images
├── 程序/                Editor files and runtime
└── 打开编辑器           Editor launcher
```

You can copy the entire `程序` folder to another Windows computer and run:

`启动任意裁.cmd`

No additional installation is required.

The local save component only listens on the local machine. **All image processing takes place locally on your computer.**

---

## Privacy

AnyCrop is designed for local image processing.

Your images are not uploaded to a remote server, and the editor does not require an internet connection.

---

## Requirements

* Windows
* A modern web browser
* No additional runtime installation required for the bundled desktop build

---

## License

See the project license for usage and distribution terms.

---

**AnyCrop**
**Crop Anything. Anywhere.**
