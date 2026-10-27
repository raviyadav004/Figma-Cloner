# 🎨 Figma-Lite Studio

### A Browser-Based Vector Design Editor Built from First Principles

Figma-Lite Studio is a modular, browser-based vector design editor built entirely with **HTML5, CSS3, and Vanilla JavaScript ES Modules**.

The project focuses on implementing the fundamental engineering concepts behind modern design applications, including spatial transformations, command-based undo and redo, selection management, snapping algorithms, multi-layer organization, SVG rendering, and browser-based project persistence.

> **Design visually. Transform precisely. Organize efficiently.**

---

## 🚀 Project Overview

Figma-Lite Studio demonstrates how a browser-based vector design editor can be developed using native web technologies without relying on a frontend framework or a third-party design-editor engine.

The application combines an interactive design workspace with a modular editor architecture that separates document state, rendering, selection, transformations, command execution, keyboard input, layer management, snapping, and export functionality.

Rather than focusing exclusively on the visual appearance of a design tool, the project emphasizes the implementation of its underlying editor mechanics.

### Core Capabilities

- Interactive vector-design workspace.
- Modular editor engine built with native JavaScript.
- SVG-based rendering and canvas interaction.
- Spatial transformations and selection management.
- Command-based undo and redo.
- Grid snapping and smart alignment calculations.
- Multi-layer organization and supported grouping operations.
- Browser-based project persistence and recovery.
- JSON project import and export.
- SVG, PNG, and JPEG export workflows.
- Responsive interface and theme switching.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| Vector Element Creation | Create rectangles, ellipses, straight lines, freeform paths, text elements, and frames. |
| Interactive Selection | Select individual elements and supported multiple selections. |
| Spatial Transformations | Move, resize, and rotate supported elements. |
| Command History | Undo and redo supported editing operations. |
| Grid Snapping | Align elements to configured grid positions where supported. |
| Smart Alignment | Calculate alignment relationships and generate supported guides. |
| Layer Management | Reorder, rename, show, hide, lock, and organize supported elements. |
| Properties Inspector | Inspect and modify supported element properties. |
| Viewport Controls | Zoom, pan, reset zoom, and fit the design to the screen. |
| Clipboard Operations | Use supported copy, cut, paste, and duplicate operations. |
| Project Persistence | Save and restore supported project state using browser storage. |
| Autosave and Recovery | Maintain a local recovery snapshot of supported editor state. |
| Project Import and Export | Import and export supported JSON project data. |
| Image Export | Export supported designs as SVG, PNG, and JPEG. |
| Keyboard Shortcuts | Access supported tools and editing operations through keyboard input. |
| Theme Switching | Switch between light and dark themes with a locally persisted preference. |
| Responsive Interface | Adapt the workspace and panels to different viewport sizes. |

Feature availability may depend on the selected element type and the specific editing workflow implemented in the application.

---

## 🎨 Design Workspace

The editor interface is organized around the design canvas, with supporting controls that make editing operations accessible.

### Workspace Components

- **Top Toolbar:** Provides access to editing actions, viewport controls, snapping options, saving, loading, and export.
- **Left Toolbar:** Contains tools for selecting and creating design elements.
- **Design Canvas:** Displays the document and its vector elements.
- **Properties Inspector:** Provides controls for inspecting and modifying supported element properties.
- **Layers Panel:** Provides access to layer-management operations.
- **Status Area:** Displays relevant editor status information.

The workspace keeps the canvas central while providing convenient access to editing and organization controls.

---

## 🧰 Primitive Creation

Figma-Lite Studio provides tools for creating common vector-design elements.

| Tool | Purpose |
|---|---|
| Select | Select and interact with existing elements. |
| Rectangle | Create rectangular shapes. |
| Ellipse | Create elliptical shapes. |
| Line | Create straight-line elements between two points. |
| Freeform | Draw curved, zigzag, and irregular paths by dragging on the canvas. |
| Text | Add text elements. |
| Frame | Create frame elements for organizing designs. |

Supported element types are represented in editor state and rendered through the SVG rendering system. The Freeform tool records pointer movement as a path, allowing users to draw curved, zigzag, and irregular strokes by dragging on the canvas.

---

## 📐 Spatial Transformations

Spatial transformations are fundamental to a vector design editor. Figma-Lite Studio separates transformation logic from rendering and other editor responsibilities.

### Transformation Capabilities

- Move selected elements.
- Resize elements using supported transformation handles.
- Rotate supported elements.
- Calculate element and selection bounds.
- Handle supported multi-element transformations.
- Convert pointer positions into canvas coordinates.
- Apply snapping and alignment calculations during supported transformations.
- Maintain supported transformations through command-based editing operations.

These operations rely on geometric calculations and coordinate conversion to support editing across different viewport scales.

---

## 🖱️ Selection Management

The `SelectionManager` maintains the active selection independently of rendering and transformation systems.

Its responsibilities include:

- Selecting individual elements.
- Managing supported multiple selections.
- Adding or removing elements from the selection.
- Clearing the current selection.
- Retrieving selected elements and identifiers.
- Calculating selection bounds.
- Performing hit-testing against canvas coordinates.
- Removing invalid or stale selection references.

Separating selection behavior into a dedicated module makes it easier to maintain and extend the editor.

---

## ↩️ Command-Based Undo and Redo

Figma-Lite Studio uses a dedicated `CommandManager` to execute editing operations and maintain reversible editing history.

### Supported Command Workflows

- Creating elements.
- Deleting elements.
- Updating element properties.
- Moving elements.
- Duplicating elements.
- Managing layer-order changes.
- Grouping and ungrouping supported selections.
- Reversing supported operations.
- Reapplying undone operations.

The command-based approach separates editing actions from the interface and helps maintain consistency between document state and user operations.

Undo and redo support depends on whether the relevant action is implemented through the command system.

---

## 🧲 Snapping and Smart Alignment

Precise positioning is an important part of any vector design editor.

Figma-Lite Studio includes snapping utilities for calculating grid positions and alignment relationships.

### Grid Snapping

- Grid-based coordinate snapping.
- Configurable grid size in editor state.
- Support for snapping during implemented creation and transformation workflows.
- Controls for enabling or disabling supported snapping behavior.

### Smart Alignment Guides

The snapping utilities calculate alignment relationships between moving elements and eligible document elements.

Supported calculations include:

- Horizontal edge alignment.
- Vertical edge alignment.
- Center alignment.
- Alignment thresholds.
- Snap-offset calculations.
- Guide generation for supported transformations.

These calculations help users position elements more consistently while editing.

---

## 🧩 Multi-Layer Management

The `LayerManager` provides operations for organizing document elements.

### Layer Operations

- Retrieve document layers.
- Rename elements.
- Reorder elements.
- Bring elements to the front.
- Send elements to the back.
- Move elements forward or backward.
- Toggle layer visibility.
- Toggle layer lock state.
- Duplicate elements.
- Delete elements.
- Group supported selections.
- Ungroup supported groups.

The Layers panel exposes the layer-management operations implemented by the editor interface.

---

## 🎛️ Properties Inspector

The Properties Inspector provides controls for inspecting and modifying supported properties of selected elements.

### Property Categories

- **Position:** Element coordinates.
- **Size:** Element dimensions.
- **Rotation:** Element rotation.
- **Appearance:** Supported visual properties.
- **Typography:** Text-specific properties where applicable.

Available properties depend on the selected element type.

The inspector integrates with editor state and the command-management system so supported property changes can participate in the editing workflow.

---

## 🔎 Viewport Controls

Figma-Lite Studio provides viewport controls for navigating the design workspace.

### Supported Controls

- Zoom in.
- Zoom out.
- Reset zoom.
- Fit the design to the screen.
- Pan the canvas.
- Maintain viewport position and zoom in editor state.
- Convert between screen coordinates and canvas coordinates.
- Apply viewport transformations during rendering.

Accurate coordinate conversion is essential when drawing and transforming elements at different zoom levels.

---

## 🎨 SVG Rendering System

Figma-Lite Studio uses SVG-based rendering for its design workspace.

The `Renderer` module translates document state into the visible canvas.

### Rendering Responsibilities

- Initialize SVG rendering layers.
- Render supported design elements.
- Render the canvas background.
- Render grid lines.
- Apply viewport transformations.
- Display selection and transformation overlays.
- Render supported snapping and alignment guides.
- Convert screen coordinates into canvas coordinates.
- Export the rendered design as SVG.

Keeping rendering separate from editor state and interaction managers improves modularity and maintainability.

---

## 💾 Project Persistence

Figma-Lite Studio includes browser-based project persistence for supported editor state.

### Local Project Saving

The editor uses browser `localStorage` to store serialized project data.

The save/load workflow supports:

- Saving the current project.
- Loading a previously saved project.
- Serializing document state.
- Restoring supported element properties.
- Preserving relevant viewport and editor settings through project state.

### Autosave and Recovery

The editor includes a local autosave mechanism that stores a serialized project snapshot under a separate storage key.

This provides a recovery mechanism for supported editor state in the current browser environment.

### Important Storage Notes

- Browser storage is local to the current browser origin and storage environment.
- Local storage is not a cloud synchronization service.
- Clearing browser storage may remove saved project data.
- Storage availability and capacity depend on the browser environment.

Export important projects as files when an independent backup is required.

---

## 📦 Import and Export

The `ExportManager` provides workflows for project-data interchange and image export.

### Supported Formats

| Format | Purpose |
|---|---|
| SVG | Scalable vector output. |
| PNG | Raster image export. |
| JPEG | Raster image export. |
| JSON | Project data export and import. |

### Export Capabilities

- Export supported designs as SVG.
- Export supported designs as PNG.
- Export supported designs as JPEG.
- Configure supported export-scale settings.
- Configure JPEG quality settings.
- Export serialized project state as JSON.
- Import and validate supported JSON project data.

Raster export uses browser-native image and canvas capabilities.

The exact set of preserved properties depends on the implemented export and import formats. Imported files should be tested before relying on them for important work.

---

## ⌨️ Keyboard Shortcuts

The `KeyboardManager` maps supported keyboard interactions to editor actions.

### Tool Shortcuts

| Shortcut | Action |
|---|---|
| `V` | Select tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `T` | Text tool |
| `L` | Straight-line tool |
| `P` | Freeform drawing tool |
| `F` | Frame tool |

### Editing Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + Y` | Redo |
| `Ctrl + C` | Copy selection |
| `Ctrl + X` | Cut selection |
| `Ctrl + V` | Paste |
| `Ctrl + D` | Duplicate selection |
| `Ctrl + G` | Group selection |
| `Ctrl + Shift + G` | Ungroup selection |
| `Ctrl + A` | Select all |
| `Ctrl + S` | Save project |
| `Enter` | Edit selected text where supported |

### Navigation Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + =` | Zoom in where supported |
| `Ctrl/Cmd + -` | Zoom out where supported |
| `Ctrl/Cmd + 0` | Reset zoom where supported |
| `Shift + 1` | Fit to screen |
| Arrow keys | Nudge selection |
| `Shift + Arrow keys` | Nudge selection by a larger increment |
| Hold `Space` | Temporary pan interaction where supported |

Shortcut availability may depend on the active tool, focused input, browser, and operating system. On macOS, supported modifier shortcuts may use the Command key.

---

## 🌗 Theme Switching

Figma-Lite Studio supports light and dark themes.

The theme initialization script, `js/theme-init.js`, runs before the stylesheets load and applies the saved theme preference early in the page lifecycle. This helps reduce a flash of the wrong theme during loading.

The application entry point, `app.js`, manages interactive theme controls, updates supported accessibility states and theme metadata, and saves the selected preference in browser storage.

If browser storage is unavailable, theme changes can still apply for the current page session.

---

## 📱 Responsive Interface

The interface is designed to adapt to desktop, tablet, and mobile viewport sizes.

### Responsive Design Considerations

- Compact toolbar layouts on smaller screens.
- Responsive Properties and Layers panels.
- Improved panel sizing and scrolling.
- Workspace dimensions that adapt to viewport size.
- Touch and pointer interaction considerations.
- Reduced unnecessary horizontal page overflow.

Responsive behavior should be verified in the target browsers and viewport sizes before submission.

---

## 🛠️ Technology Stack

Figma-Lite Studio follows the original requirement to use native web technologies.

| Technology | Purpose |
|---|---|
| HTML5 | Application structure and interface. |
| CSS3 | Styling and responsive layouts. |
| Vanilla JavaScript ES Modules | Modular application and editor logic. |
| SVG | Vector element rendering. |
| DOM APIs | User-interface interaction and element management. |
| Pointer Events | Canvas interaction. |
| Keyboard Events | Editor shortcuts. |
| LocalStorage | Local preferences, project persistence, and supported autosave workflows. |
| Canvas API | Raster export workflows. |
| File APIs | Supported project import and export. |
| Browser APIs | Native browser integration. |

### Technology Constraints

The project does not require:

- React
- Vue
- Angular
- TypeScript
- Next.js
- Tailwind CSS
- A third-party design-editor engine

The editor architecture is implemented using native JavaScript modules, classes, functions, and browser APIs.

---

## 🏗️ Project Architecture

The project separates editor logic into modules to keep responsibilities clear and changes easier to maintain.

```text
Figma-Lite-Professional/
├── index.html
├── app.js
├── README.md
├── js/
│   └── theme-init.js
├── css/
│   ├── styles.css
│   ├── layout.css
│   └── components.css
└── src/
    ├── core/
    │   ├── Editor.js
    │   ├── State.js
    │   └── CommandManager.js
    ├── managers/
    │   ├── SelectionManager.js
    │   ├── TransformManager.js
    │   ├── KeyboardManager.js
    │   ├── LayerManager.js
    │   └── ExportManager.js
    ├── renderer/
    │   └── Renderer.js
    ├── tools/
    │   └── tools.js
    └── utils/
        ├── geometry.js
        ├── snapping.js
        └── helpers.js
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| `app.js` | Application entry point, initialization, and theme controls. |
| `js/theme-init.js` | Early theme preference initialization. |
| `Editor.js` | Coordinates editor systems and user interactions. |
| `State.js` | Maintains document and editor state. |
| `CommandManager.js` | Executes supported reversible editing commands. |
| `Renderer.js` | Renders the SVG-based design workspace. |
| `SelectionManager.js` | Handles selection and hit-testing. |
| `TransformManager.js` | Manages transformations and supported alignment behavior. |
| `KeyboardManager.js` | Processes keyboard shortcuts. |
| `LayerManager.js` | Manages layer properties and ordering. |
| `ExportManager.js` | Handles image export and JSON project data. |
| `tools.js` | Implements shape, straight-line, text, frame, and freeform drawing tools. |
| `geometry.js` | Provides geometric calculations. |
| `snapping.js` | Calculates grid snapping and alignment guides. |
| `helpers.js` | Provides shared utility functions. |

### CSS Organization

Styles are divided into exactly three CSS files:

- `css/styles.css` — global styling and theme-related rules.
- `css/layout.css` — page layout, workspace, and responsive structure.
- `css/components.css` — reusable interface components and their visual states.

This organization keeps global styles, layout rules, and component styles separated without introducing additional stylesheets.

---

## 🌟 What Makes Figma-Lite Studio Different?

Figma-Lite Studio brings together four core ideas.

### Interactive Design Workspace

A browser-based interface for creating and editing supported vector elements.

### Custom Editor Engine

Dedicated systems for state, rendering, selection, transformations, command history, snapping, and layers.

### Document Persistence

Browser-based saving, recovery, and project-data interchange for supported editor state.

### Export Workflows

SVG, PNG, JPEG, and JSON workflows implemented through browser-native functionality.

Together, these components demonstrate how fundamental design-editor mechanics can be organized into a modular application using native web technologies.

---

## 👨‍💻 Author

**Ravi Yadav**

---

*Figma-Lite Studio — a practical exploration of browser-based vector editing, modular JavaScript architecture, and core design-editor engineering.*