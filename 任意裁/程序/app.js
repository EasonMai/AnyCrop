(function () {
  'use strict';

  var canvas = document.getElementById('editorCanvas');
  var ctx = canvas.getContext('2d');
  var canvasWrap = document.getElementById('canvasWrap');
  var canvasStage = document.getElementById('canvasStage');
  // View settings never resample source images or enter the undo history.
  var view = { scale: 1, fit: true, left: 0, top: 0 };
  var emptyState = document.getElementById('emptyState');
  var fileInput = document.getElementById('fileInput');
  var dropZone = document.getElementById('dropZone');
  var layersList = document.getElementById('layersList');
  var layerStrip = document.getElementById('layerStrip');
  var layerCount = document.getElementById('layerCount');
  var toast = document.getElementById('toast');
  var modeHint = document.getElementById('modeHint');
  var brushControl = document.getElementById('brushControl');
  var toleranceControl = document.getElementById('toleranceControl');
  var brushSize = document.getElementById('brushSize');
  var brushSizeValue = document.getElementById('brushSizeValue');
  var tolerance = document.getElementById('tolerance');
  var toleranceValue = document.getElementById('toleranceValue');
  var toolTitle = document.getElementById('toolTitle');
  var toolDescription = document.getElementById('toolDescription');
  var helpModal = document.getElementById('helpModal');
  var splitControl = document.getElementById('splitControl');
  var splitModeValue = document.getElementById('splitModeValue');
  var deleteSelectionButton = document.getElementById('deleteSelectionBtn');
  var imageContextMenu = document.getElementById('imageContextMenu');
  var contextMenuTitle = document.getElementById('contextMenuTitle');
  var contextDeleteButton = document.getElementById('contextDeleteBtn');
  var contextClearCutsButton = document.getElementById('contextClearCutsBtn');
  var contextSeparateButton = document.getElementById('contextSeparateBtn');
  var separateButton = document.getElementById('separateBtn');
  var stitchCount = document.getElementById('stitchCount');

  var state = {
    layers: [],
    selectedId: null,
    mode: 'move',
    stitch: 'horizontal',
    history: [],
    future: [],
    toastTimer: null,
    splitMode: 'straight',
    pendingSplit: null,
    splitSelection: null,
    contextTarget: null
  };

  var toolMeta = {
    move: {
      title: '移动图片',
      description: '拖动图片调整位置。切割后可先拆成独立图片，再拖动各块拼在一起。',
      hint: '拖动图片自由拼合 · 在图层中勾选要拼接的图片'
    },
    split: {
      title: '分割图片',
      description: '按住左键可连续划多条分割线。右键可删除区域，或拆成独立图片后移动、拼接。',
      hint: '左键拖动连续分割 · 右键点击区域进行删除'
    },
    erase: {
      title: '画线裁掉',
      description: '按住鼠标划过不需要的区域，它会立刻变透明。',
      hint: '按住鼠标划过图片中不需要的部分'
    },
    bg: {
      title: '变透明',
      description: '点击图片中的颜色，连续的相近颜色会变成透明。',
      hint: '点击图片背景色，将相近颜色变透明'
    }
  };

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2300);
  }

  function makeId() {
    return 'layer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function copySplitPaths(paths) {
    return (paths || []).map(function (path) {
      return path.map(function (point) { return { x: point.x, y: point.y }; });
    });
  }

  function snapshot() {
    return state.layers.map(function (layer) {
      return {
        id: layer.id,
        name: layer.name,
        x: layer.x,
        y: layer.y,
        visible: layer.visible,
        stitchIncluded: layer.stitchIncluded !== false,
        width: layer.width,
        height: layer.height,
        splitPaths: copySplitPaths(layer.splitPaths),
        pixels: layer.canvas.toDataURL('image/png')
      };
    });
  }

  function restoreSnapshot(serialized, selectedId) {
    if (!serialized.length) {
      state.layers = [];
      state.selectedId = null;
      renderAll();
      return;
    }

    var next = [];
    var pending = serialized.length;
    serialized.forEach(function (item) {
      var image = new Image();
      image.onload = function () {
        var layerCanvas = document.createElement('canvas');
        layerCanvas.width = item.width;
        layerCanvas.height = item.height;
        layerCanvas.getContext('2d').drawImage(image, 0, 0, item.width, item.height);
        next.push({
          id: item.id,
          name: item.name,
          x: item.x,
          y: item.y,
          visible: item.visible,
          stitchIncluded: item.stitchIncluded !== false,
          width: item.width,
          height: item.height,
          splitPaths: copySplitPaths(item.splitPaths),
          canvas: layerCanvas
        });
        pending -= 1;
        if (pending === 0) {
          next.sort(function (a, b) {
            return serialized.findIndex(function (entry) { return entry.id === a.id; }) -
              serialized.findIndex(function (entry) { return entry.id === b.id; });
          });
          state.layers = next;
          state.selectedId = next.some(function (layer) { return layer.id === selectedId; })
            ? selectedId
            : (next[0] ? next[0].id : null);
          renderAll();
        }
      };
      image.onerror = function () {
        pending -= 1;
        if (pending === 0) {
          state.layers = next;
          state.selectedId = next[0] ? next[0].id : null;
          renderAll();
        }
      };
      image.src = item.pixels;
    });
  }

  function commitHistory() {
    state.history.push({ layers: snapshot(), selectedId: state.selectedId });
    if (state.history.length > 40) state.history.shift();
    state.future = [];
  }

  function undo() {
    closeContextMenu();
    state.pendingSplit = null;
    state.splitSelection = null;
    if (!state.history.length) {
      showToast('已经是最早一步');
      return;
    }
    state.future.push({ layers: snapshot(), selectedId: state.selectedId });
    var previous = state.history.pop();
    restoreSnapshot(previous.layers, previous.selectedId);
  }

  function redo() {
    closeContextMenu();
    state.pendingSplit = null;
    state.splitSelection = null;
    if (!state.future.length) {
      showToast('没有可重做的操作');
      return;
    }
    state.history.push({ layers: snapshot(), selectedId: state.selectedId });
    var next = state.future.pop();
    restoreSnapshot(next.layers, next.selectedId);
  }

  function selectedLayer() {
    return state.layers.find(function (layer) {
      return layer.id === state.selectedId;
    }) || null;
  }

  function deleteLayer(layer) {
    var index = state.layers.indexOf(layer);
    if (index < 0) return;
    commitHistory();
    if (state.pendingSplit && state.pendingSplit.layer === layer) state.pendingSplit = null;
    if (state.splitSelection && state.splitSelection.layer === layer) state.splitSelection = null;
    state.layers.splice(index, 1);
    if (state.selectedId === layer.id) {
      var replacement = state.layers[Math.min(index, state.layers.length - 1)];
      state.selectedId = replacement ? replacement.id : null;
    }
    renderAll();
    showToast('已删除图片：' + layer.name);
  }

  function fitLayer(layer) {
    layer.x = Math.round((960 - layer.width) / 2);
    layer.y = Math.round((640 - layer.height) / 2);
  }

  function viewAnchor(event) {
    var rect = canvasWrap.getBoundingClientRect();
    var clientX = event ? event.clientX : rect.left + canvasWrap.clientWidth / 2;
    var clientY = event ? event.clientY : rect.top + canvasWrap.clientHeight / 2;
    return { point: canvasPoint({ clientX: clientX, clientY: clientY }), clientX: clientX, clientY: clientY };
  }

  function layoutView(anchor) {
    if (!canvasWrap || !canvasStage) return;
    var width = canvasWrap.clientWidth || 960;
    var height = canvasWrap.clientHeight || 640;
    if (view.fit) view.scale = Math.min(width / canvas.width, height / canvas.height, 1);
    var shownWidth = canvas.width * view.scale;
    var shownHeight = canvas.height * view.scale;
    canvas.style.width = shownWidth + 'px';
    canvas.style.height = shownHeight + 'px';
    canvas.style.imageRendering = view.scale > 1 ? 'pixelated' : 'auto';
    canvasStage.style.width = Math.max(width, shownWidth) + 'px';
    canvasStage.style.height = Math.max(height, shownHeight) + 'px';
    if (anchor && !view.fit) {
      var rect = canvas.getBoundingClientRect();
      canvasWrap.scrollLeft += rect.left + (anchor.point.x - view.left) * view.scale - anchor.clientX;
      canvasWrap.scrollTop += rect.top + (anchor.point.y - view.top) * view.scale - anchor.clientY;
    } else if (view.fit) {
      canvasWrap.scrollLeft = 0;
      canvasWrap.scrollTop = 0;
    }
    document.getElementById('zoomValue').textContent = Math.round(view.scale * 100) + '%';
    document.getElementById('zoomOutBtn').disabled = view.scale <= 0.05;
    document.getElementById('zoomInBtn').disabled = view.scale >= 8;
    document.getElementById('fitCanvasBtn').setAttribute('aria-pressed', String(view.fit));
    document.getElementById('canvasSizeLabel').textContent = '视图 ' + canvas.width + ' × ' + canvas.height;
  }

  function setZoom(scale, event) {
    var anchor = viewAnchor(event);
    view.fit = false;
    view.scale = Math.max(0.05, Math.min(8, scale));
    closeContextMenu();
    layoutView(anchor);
  }

  function fitCanvasView() {
    view.fit = true;
    closeContextMenu();
    layoutView();
  }

  function updateCanvasBounds() {
    var left = 0, top = 0, right = 960, bottom = 640;
    state.layers.forEach(function (layer) {
      if (!layer.visible) return;
      left = Math.min(left, Math.floor(layer.x) - 40);
      top = Math.min(top, Math.floor(layer.y) - 40);
      right = Math.max(right, Math.ceil(layer.x + layer.width) + 40);
      bottom = Math.max(bottom, Math.ceil(layer.y + layer.height) + 40);
    });
    if (view.left === left && view.top === top && canvas.width === right - left && canvas.height === bottom - top) return;
    var anchor = viewAnchor();
    view.left = left;
    view.top = top;
    canvas.width = right - left;
    canvas.height = bottom - top;
    ctx = canvas.getContext('2d');
    layoutView(anchor);
  }

  function addImage(image, name) {
    var layerCanvas = document.createElement('canvas');
    layerCanvas.width = image.naturalWidth || image.width;
    layerCanvas.height = image.naturalHeight || image.height;
    layerCanvas.getContext('2d').drawImage(image, 0, 0);
    var layer = {
      id: makeId(),
      name: name || '未命名图片',
      canvas: layerCanvas,
      width: layerCanvas.width,
      height: layerCanvas.height,
      x: 0,
      y: 0,
      splitPaths: [],
      stitchIncluded: true,
      visible: true
    };
    fitLayer(layer);
    commitHistory();
    state.layers.push(layer);
    state.selectedId = layer.id;
    renderAll();
    showToast('已导入 ' + layer.name);
  }

  function loadFiles(fileList) {
    var files = Array.from(fileList || []).filter(function (file) {
      return file.type && file.type.indexOf('image/') === 0;
    });
    // Decode in the background, then add in file order for predictable stacking.
    Promise.all(files.map(function (file) {
      return new Promise(function (resolve) {
        var objectUrl = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () { URL.revokeObjectURL(objectUrl); resolve({ image: image, name: file.name }); };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); resolve({ name: file.name }); };
        image.src = objectUrl;
      });
    })).then(function (loaded) {
      loaded.forEach(function (item) {
        if (item.image) addImage(item.image, item.name);
        else showToast('无法读取 ' + item.name);
      });
    });
  }

  function drawCheckerboard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!drawCheckerboard.tile) {
      var tile = document.createElement('canvas');
      tile.width = tile.height = 32;
      var tileCtx = tile.getContext('2d');
      tileCtx.fillStyle = '#f4f7f7';
      tileCtx.fillRect(0, 0, 32, 32);
      tileCtx.fillStyle = '#e8eeee';
      tileCtx.fillRect(16, 0, 16, 16);
      tileCtx.fillRect(0, 16, 16, 16);
      drawCheckerboard.tile = tile;
    }
    ctx.fillStyle = ctx.createPattern(drawCheckerboard.tile, 'repeat');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function splitPath(selection) {
    if (!selection || !selection.points || !selection.points.length) return null;
    return selection.points;
  }

  function drawSplitPath(path) {
    if (!path || path.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#f48a54';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (var index = 1; index < path.length; index += 1) {
      ctx.lineTo(path[index].x, path[index].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f48a54';
    ctx.beginPath();
    ctx.arc(path[0].x, path[0].y, 5, 0, Math.PI * 2);
    ctx.arc(path[path.length - 1].x, path[path.length - 1].y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (path.length === 2) {
      var angle = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
      var arrowSize = 13;
      ctx.beginPath();
      ctx.moveTo(path[1].x, path[1].y);
      ctx.lineTo(
        path[1].x - Math.cos(angle - Math.PI / 6) * arrowSize,
        path[1].y - Math.sin(angle - Math.PI / 6) * arrowSize
      );
      ctx.lineTo(
        path[1].x - Math.cos(angle + Math.PI / 6) * arrowSize,
        path[1].y - Math.sin(angle + Math.PI / 6) * arrowSize
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCanvas() {
    drawCheckerboard();
    ctx.save();
    ctx.translate(-view.left, -view.top);
    state.layers.forEach(function (layer) {
      if (layer.visible) ctx.drawImage(layer.canvas, layer.x, layer.y);
    });
    if (state.splitSelection && state.splitSelection.overlay &&
      state.splitSelection.layer && state.splitSelection.layer.visible) {
      ctx.drawImage(
        state.splitSelection.overlay,
        state.splitSelection.layer.x,
        state.splitSelection.layer.y
      );
    }
    var selected = selectedLayer();
    if (selected && selected.visible && state.mode === 'move') {
      ctx.save();
      ctx.strokeStyle = '#0f596c';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(selected.x + 1, selected.y + 1, selected.width - 2, selected.height - 2);
      ctx.restore();
    }
    state.layers.forEach(function (layer) {
      if (!layer.visible) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(layer.x, layer.y, layer.width, layer.height);
      ctx.clip();
      (layer.splitPaths || []).forEach(function (path) {
        drawSplitPath(path.map(function (point) {
          return { x: point.x + layer.x, y: point.y + layer.y };
        }));
      });
      ctx.restore();
    });
    drawSplitPath(splitPath(state.pendingSplit));
    ctx.restore();
  }

  function renderLayers() {
    if (!layersList || !layerStrip) return;
    layerCount.textContent = state.layers.length;
    layersList.innerHTML = '';
    layerStrip.innerHTML = '';
    if (!state.layers.length) {
      layersList.innerHTML = '<div class="list-empty">还没有图片</div>';
      layerStrip.innerHTML = '<span class="strip-empty">导入后，图片会出现在这里</span>';
      return;
    }

    state.layers.slice().reverse().forEach(function (layer) {
      var item = document.createElement('div');
      item.className = 'layer-row' + (layer.id === state.selectedId ? ' active' : '');
      var stitchCheckbox = document.createElement('input');
      stitchCheckbox.type = 'checkbox';
      stitchCheckbox.className = 'layer-stitch-checkbox';
      stitchCheckbox.checked = layer.stitchIncluded !== false;
      stitchCheckbox.title = '用于拼接';
      stitchCheckbox.setAttribute('aria-label', '用于拼接：' + layer.name);
      stitchCheckbox.addEventListener('change', function () {
        layer.stitchIncluded = stitchCheckbox.checked;
        renderAll();
      });
      var selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'layer-select';
      selectButton.setAttribute('aria-pressed', layer.id === state.selectedId ? 'true' : 'false');
      selectButton.innerHTML = '<span class="layer-thumb"></span><span class="layer-name" title="' +
        escapeHtml(layer.name) + '">' + escapeHtml(layer.name) + '</span>';
      selectButton.querySelector('.layer-thumb').style.backgroundImage =
        'url("' + layer.canvas.toDataURL('image/png') + '")';
      selectButton.addEventListener('click', function () {
        if (state.splitSelection && state.splitSelection.layer !== layer) cancelActiveSplit();
        state.selectedId = layer.id;
        renderAll();
      });
      var visibilityButton = document.createElement('button');
      visibilityButton.type = 'button';
      visibilityButton.className = 'layer-eye';
      visibilityButton.textContent = layer.visible ? '◉' : '○';
      visibilityButton.title = layer.visible ? '隐藏图片' : '显示图片';
      visibilityButton.setAttribute('aria-label', visibilityButton.title + '：' + layer.name);
      visibilityButton.addEventListener('click', function () {
        commitHistory();
        layer.visible = !layer.visible;
        renderAll();
      });
      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'layer-delete';
      deleteButton.textContent = '×';
      deleteButton.title = '删除图片';
      deleteButton.setAttribute('aria-label', '删除图片：' + layer.name);
      deleteButton.addEventListener('click', function () { deleteLayer(layer); });
      item.appendChild(stitchCheckbox);
      item.appendChild(selectButton);
      item.appendChild(visibilityButton);
      item.appendChild(deleteButton);
      layersList.appendChild(item);

      var preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'strip-item' + (layer.id === state.selectedId ? ' active' : '');
      preview.innerHTML = '<span class="strip-thumb"></span><span>' + escapeHtml(layer.name) + '</span>';
      preview.querySelector('.strip-thumb').style.backgroundImage =
        'url("' + layer.canvas.toDataURL('image/png') + '")';
      preview.addEventListener('click', function () {
        if (state.splitSelection && state.splitSelection.layer !== layer) cancelActiveSplit();
        state.selectedId = layer.id;
        renderAll();
      });
      layerStrip.appendChild(preview);
    });
  }

  function renderAll() {
    closeContextMenu();
    updateCanvasBounds();
    drawCanvas();
    renderLayers();
    if (emptyState) emptyState.hidden = state.layers.length > 0;
    if (canvasWrap) canvasWrap.className = 'canvas-wrap mode-' + state.mode;
    var meta = toolMeta[state.mode];
    if (toolTitle) toolTitle.textContent = meta.title;
    if (toolDescription) toolDescription.textContent = meta.description;
    if (modeHint) {
      modeHint.textContent = state.splitSelection && state.splitSelection.regionMask
        ? '已选中区域 · 右键菜单、上方删除按钮或 Delete 键均可删除'
        : (state.mode === 'split' && selectedLayer() && (selectedLayer().splitPaths || []).length
          ? '已划 ' + selectedLayer().splitPaths.length + ' 条线 · 可继续分割，或右键点击区域删除'
          : meta.hint);
    }
    if (brushControl) brushControl.hidden = state.mode !== 'erase';
    if (toleranceControl) toleranceControl.hidden = state.mode !== 'bg';
    if (splitControl) splitControl.hidden = state.mode !== 'split';
    if (splitModeValue) splitModeValue.textContent = state.splitMode === 'straight' ? '直线预览' : '自由轨迹';
    if (deleteSelectionButton) {
      deleteSelectionButton.hidden = !(state.splitSelection && state.splitSelection.regionMask);
    }
    var selected = selectedLayer();
    if (separateButton) separateButton.disabled = !selected || !selected.visible || !(selected.splitPaths || []).length;
    if (stitchCount) stitchCount.textContent = '已勾选 ' + stitchLayers().length + ' 张可见图片';
  }

  function canvasPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: view.left + (event.clientX - rect.left) * canvas.width / (rect.width || canvas.width),
      y: view.top + (event.clientY - rect.top) * canvas.height / (rect.height || canvas.height)
    };
  }

  function contains(layer, point) {
    return !!layer && !!point &&
      point.x >= layer.x && point.x <= layer.x + layer.width &&
      point.y >= layer.y && point.y <= layer.y + layer.height;
  }

  function hitLayer(point, opaqueOnly) {
    for (var index = state.layers.length - 1; index >= 0; index -= 1) {
      var layer = state.layers[index];
      if (!layer.visible) continue;
      if (!contains(layer, point)) continue;
      if (opaqueOnly) {
        var x = Math.min(layer.width - 1, Math.floor(point.x - layer.x));
        var y = Math.min(layer.height - 1, Math.floor(point.y - layer.y));
        if (!layer.canvas.getContext('2d').getImageData(x, y, 1, 1).data[3]) continue;
      }
      return layer;
    }
    return null;
  }

  function eraseAt(layer, point) {
    var brush = Number(brushSize ? brushSize.value : 48);
    var localX = point.x - layer.x;
    var localY = point.y - layer.y;
    var layerCtx = layer.canvas.getContext('2d');
    layerCtx.save();
    layerCtx.globalCompositeOperation = 'destination-out';
    layerCtx.beginPath();
    layerCtx.arc(localX, localY, brush / 2, 0, Math.PI * 2);
    layerCtx.fill();
    layerCtx.restore();
  }

  function removeSimilarColorAt(layer, point, toleranceAmount) {
    var localX = Math.round(point.x - layer.x);
    var localY = Math.round(point.y - layer.y);
    if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return 0;
    var layerCtx = layer.canvas.getContext('2d');
    var imageData = layerCtx.getImageData(0, 0, layer.width, layer.height);
    var data = imageData.data;
    var start = (localY * layer.width + localX) * 4;
    if (data[start + 3] === 0) return 0;
    var target = [data[start], data[start + 1], data[start + 2]];
    var maxDistance = Math.max(0, Number(toleranceAmount)) * 4.4;
    var visited = new Uint8Array(layer.width * layer.height);
    var queue = [[localX, localY]];
    var changed = 0;
    visited[localY * layer.width + localX] = 1;
    while (queue.length) {
      var current = queue.pop();
      var x = current[0];
      var y = current[1];
      var offset = (y * layer.width + x) * 4;
      var distance = Math.hypot(data[offset] - target[0], data[offset + 1] - target[1], data[offset + 2] - target[2]);
      if (distance > maxDistance || data[offset + 3] === 0) continue;
      data[offset + 3] = 0;
      changed += 1;
      [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(function (neighbor) {
        var nx = neighbor[0];
        var ny = neighbor[1];
        if (nx >= 0 && ny >= 0 && nx < layer.width && ny < layer.height) {
          var index = ny * layer.width + nx;
          if (!visited[index]) {
            visited[index] = 1;
            queue.push([nx, ny]);
          }
        }
      });
    }
    layerCtx.putImageData(imageData, 0, 0);
    return changed;
  }

  function removeSimilarColor(layer, point) {
    return removeSimilarColorAt(layer, point, Number(tolerance ? tolerance.value : 32));
  }

  function buildSplitRegions(layer, paths) {
    var width = layer.width;
    var height = layer.height;
    var barrierCanvas = document.createElement('canvas');
    barrierCanvas.width = width;
    barrierCanvas.height = height;
    var barrierCtx = barrierCanvas.getContext('2d');
    barrierCtx.strokeStyle = '#ffffff';
    barrierCtx.lineWidth = 1;
    barrierCtx.lineCap = 'round';
    barrierCtx.lineJoin = 'round';
    paths.forEach(function (path) {
      barrierCtx.beginPath();
      path.forEach(function (point, index) {
        if (index === 0) barrierCtx.moveTo(point.x, point.y);
        else barrierCtx.lineTo(point.x, point.y);
      });
      barrierCtx.stroke();
    });
    var barrierData = barrierCtx.getImageData(0, 0, width, height).data;
    var blocked = new Uint8Array(width * height);
    for (var pixel = 0; pixel < blocked.length; pixel += 1) {
      if (barrierData[pixel * 4 + 3] > 12) blocked[pixel] = 1;
    }

    var labels = new Uint32Array(width * height);
    var queue = new Uint32Array(labels.length);
    var regionCount = 0;
    var head = 0;
    var tail = 0;
    function enqueue(index, label, includeBarrier) {
      if (!labels[index] && (includeBarrier || !blocked[index])) {
        labels[index] = label;
        queue[tail++] = index;
      }
    }
    function visitNeighbors(index, label, includeBarrier) {
      var x = index % width;
      if (x > 0) enqueue(index - 1, label, includeBarrier);
      if (x + 1 < width) enqueue(index + 1, label, includeBarrier);
      if (index >= width) enqueue(index - width, label, includeBarrier);
      if (index + width < labels.length) enqueue(index + width, label, includeBarrier);
    }
    for (var start = 0; start < labels.length; start += 1) {
      if (labels[start] || blocked[start]) continue;
      regionCount += 1;
      head = 0;
      tail = 0;
      enqueue(start, regionCount, false);
      while (head < tail) visitNeighbors(queue[head++], regionCount, false);
    }
    // Assign the thin cut boundary to its nearest region so no undeletable seam remains.
    head = 0;
    tail = 0;
    for (var index = 0; index < labels.length; index += 1) {
      if (labels[index]) queue[tail++] = index;
    }
    while (head < tail) {
      var current = queue[head++];
      visitNeighbors(current, labels[current], true);
    }
    return { labels: labels, count: regionCount };
  }

  function getSplitRegions(layer) {
    if (!layer.splitRegions) {
      layer.splitRegions = buildSplitRegions(layer, layer.splitPaths || []);
    }
    return layer.splitRegions;
  }

  function addSplitPath(layer, points) {
    points = points.filter(function (point, index) {
      return !index || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.01;
    });
    if (points.length < 2) return false;
    var localPath = extendPathToLayerBounds(layer, points).map(function (point) {
      return { x: point.x - layer.x, y: point.y - layer.y };
    });
    var paths = (layer.splitPaths || []).concat([localPath]);
    var regions = buildSplitRegions(layer, paths);
    if (regions.count <= getSplitRegions(layer).count) {
      showToast('这条线没有分出新区域，请划过图片后再试');
      return false;
    }
    commitHistory();
    layer.splitPaths = paths;
    layer.splitRegions = regions;
    showToast('已划 ' + paths.length + ' 条线，可继续分割或右键点击区域删除');
    return true;
  }

  function buildSplitRegion(layer, clickPoint) {
    var regions = getSplitRegions(layer);
    var x = Math.max(0, Math.min(layer.width - 1, Math.floor(clickPoint.x - layer.x)));
    var y = Math.max(0, Math.min(layer.height - 1, Math.floor(clickPoint.y - layer.y)));
    var label = regions.labels[y * layer.width + x];
    var mask = new Uint8Array(regions.labels.length);
    var count = 0;
    for (var index = 0; index < mask.length; index += 1) {
      if (label && regions.labels[index] === label) {
        mask[index] = 1;
        count += 1;
      }
    }
    return { mask: mask, count: count };
  }

  function rayToLayerBounds(layer, point, direction) {
    var left = layer.x;
    var right = layer.x + layer.width;
    var top = layer.y;
    var bottom = layer.y + layer.height;
    var candidates = [];
    if (direction.x !== 0) {
      [left, right].forEach(function (edgeX) {
        var t = (edgeX - point.x) / direction.x;
        var y = point.y + direction.y * t;
        if (t >= 0 && y >= top && y <= bottom) candidates.push(t);
      });
    }
    if (direction.y !== 0) {
      [top, bottom].forEach(function (edgeY) {
        var t = (edgeY - point.y) / direction.y;
        var x = point.x + direction.x * t;
        if (t >= 0 && x >= left && x <= right) candidates.push(t);
      });
    }
    if (!candidates.length) return point;
    var distance = Math.min.apply(Math, candidates);
    return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
  }

  function extendPathToLayerBounds(layer, points) {
    if (!points || points.length < 2) return points || [];
    var extended = points.slice();
    if (contains(layer, extended[0])) {
      extended[0] = rayToLayerBounds(layer, extended[0], {
        x: extended[0].x - extended[1].x,
        y: extended[0].y - extended[1].y
      });
    }
    var last = extended.length - 1;
    if (contains(layer, extended[last])) {
      extended[last] = rayToLayerBounds(layer, extended[last], {
        x: extended[last].x - extended[last - 1].x,
        y: extended[last].y - extended[last - 1].y
      });
    }
    return extended;
  }

  function makeRegionOverlay(layer, region) {
    var overlay = document.createElement('canvas');
    overlay.width = layer.width;
    overlay.height = layer.height;
    var overlayCtx = overlay.getContext('2d');
    var image = overlayCtx.createImageData(layer.width, layer.height);
    var pixels = layer.canvas.getContext('2d').getImageData(0, 0, layer.width, layer.height).data;
    for (var index = 0; index < region.length; index += 1) {
      if (!region[index]) continue;
      image.data[index * 4] = 244;
      image.data[index * 4 + 1] = 138;
      image.data[index * 4 + 2] = 84;
      image.data[index * 4 + 3] = Math.round(pixels[index * 4 + 3] * 0.3);
    }
    overlayCtx.putImageData(image, 0, 0);
    return overlay;
  }

  function selectSplitRegion(point, layer) {
    layer = layer || hitLayer(point, true);
    if (!layer || !layer.visible || !contains(layer, point) || !(layer.splitPaths || []).length) return false;
    var result = buildSplitRegion(layer, point);
    if (!result.count) return false;
    state.selectedId = layer.id;
    state.splitSelection = {
      layer: layer,
      regionMask: result.mask,
      regionCount: result.count,
      overlay: makeRegionOverlay(layer, result.mask)
    };
    renderAll();
    return true;
  }

  function deleteSelectedRegion() {
    var selection = state.splitSelection;
    if (!selection || !selection.layer || !selection.layer.canvas ||
      state.layers.indexOf(selection.layer) < 0 || !selection.regionMask ||
      selection.regionMask.length !== selection.layer.width * selection.layer.height) {
      state.splitSelection = null;
      state.pendingSplit = null;
      renderAll();
      showToast('先点击分割线的一侧');
      return;
    }
    commitHistory();
    var layerCtx = selection.layer.canvas.getContext('2d');
    var imageData = layerCtx.getImageData(0, 0, selection.layer.width, selection.layer.height);
    var changed = 0;
    for (var index = 0; index < selection.regionMask.length; index += 1) {
      if (!selection.regionMask[index]) continue;
      var offset = index * 4;
      if (imageData.data[offset + 3] !== 0) {
        imageData.data[offset + 3] = 0;
        changed += 1;
      }
    }
    layerCtx.putImageData(imageData, 0, 0);
    state.splitSelection = null;
    state.pendingSplit = null;
    renderAll();
    showToast(changed ? '已删除选中区域' : '选中区域已经是透明');
  }

  function cancelActiveSplit() {
    state.pendingSplit = null;
    state.splitSelection = null;
    renderAll();
  }

  function closeContextMenu(restoreFocus) {
    if (!imageContextMenu) return;
    var hadFocus = imageContextMenu.contains(document.activeElement);
    imageContextMenu.hidden = true;
    state.contextTarget = null;
    if (restoreFocus && hadFocus) canvas.focus({ preventScroll: true });
  }

  function openContextMenu(event) {
    event.preventDefault();
    closeContextMenu();
    if (state.pendingSplit || !imageContextMenu) return;
    var point = canvasPoint(event);
    var layer = hitLayer(point, true);
    state.splitSelection = null;
    if (!layer) {
      renderAll();
      return;
    }
    state.selectedId = layer.id;
    var hasCuts = (layer.splitPaths || []).length > 0;
    if (hasCuts && !selectSplitRegion(point, layer)) return;
    if (!hasCuts) renderAll();
    state.contextTarget = { layer: layer, selection: state.splitSelection };
    contextMenuTitle.textContent = hasCuts ? '已选中切割区域' : '已选中图片';
    contextDeleteButton.textContent = hasCuts ? '删除选中区域' : '删除图片';
    contextClearCutsButton.hidden = !hasCuts;
    if (contextSeparateButton) contextSeparateButton.hidden = !hasCuts;
    imageContextMenu.hidden = false;
    var bounds = imageContextMenu.getBoundingClientRect();
    imageContextMenu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8)) + 'px';
    imageContextMenu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8)) + 'px';
    contextDeleteButton.focus({ preventScroll: true });
  }

  function deleteContextTarget() {
    var target = state.contextTarget;
    closeContextMenu(true);
    if (!target || state.layers.indexOf(target.layer) < 0) return;
    if (target.selection) {
      if (state.splitSelection !== target.selection) return;
      deleteSelectedRegion();
    } else {
      deleteLayer(target.layer);
    }
  }

  function clearContextCuts() {
    var target = state.contextTarget;
    closeContextMenu(true);
    if (!target || state.layers.indexOf(target.layer) < 0 || !(target.layer.splitPaths || []).length) return;
    commitHistory();
    target.layer.splitPaths = [];
    target.layer.splitRegions = null;
    cancelActiveSplit();
    showToast('已清除分割线，可重新划线');
  }

  function setToolMode(mode) {
    state.pendingSplit = null;
    state.splitSelection = null;
    state.mode = mode;
    document.querySelectorAll('.tool-button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
    renderAll();
  }

  // Copy each nonempty region into a tightly cropped layer at its original position.
  function makeLayerPieces(layer) {
    var width = layer.width;
    var height = layer.height;
    var source = layer.canvas.getContext('2d').getImageData(0, 0, width, height).data;
    var labels = (layer.splitPaths || []).length ? getSplitRegions(layer).labels : null;
    var bounds = new Map();
    for (var index = 0; index < width * height; index += 1) {
      if (!source[index * 4 + 3]) continue;
      var label = labels ? labels[index] : 1;
      var x = index % width;
      var y = Math.floor(index / width);
      var box = bounds.get(label);
      if (!box) {
        box = { left: x, top: y, right: x, bottom: y };
        bounds.set(label, box);
      } else {
        box.left = Math.min(box.left, x);
        box.top = Math.min(box.top, y);
        box.right = Math.max(box.right, x);
        box.bottom = Math.max(box.bottom, y);
      }
    }
    var pieces = [];
    bounds.forEach(function (box) {
      var pieceCanvas = document.createElement('canvas');
      pieceCanvas.width = box.right - box.left + 1;
      pieceCanvas.height = box.bottom - box.top + 1;
      box.imageData = pieceCanvas.getContext('2d').createImageData(pieceCanvas.width, pieceCanvas.height);
      box.piece = {
        id: makeId(),
        name: layer.name + (bounds.size > 1 ? ' · 切片 ' + (pieces.length + 1) : ''),
        x: layer.x + box.left,
        y: layer.y + box.top,
        width: pieceCanvas.width,
        height: pieceCanvas.height,
        canvas: pieceCanvas,
        visible: layer.visible,
        stitchIncluded: layer.stitchIncluded !== false,
        splitPaths: []
      };
      pieces.push(box.piece);
    });
    for (var pixel = 0; pixel < width * height; pixel += 1) {
      var offset = pixel * 4;
      if (!source[offset + 3]) continue;
      var target = bounds.get(labels ? labels[pixel] : 1);
      var destination = ((Math.floor(pixel / width) - target.top) * target.piece.width +
        (pixel % width) - target.left) * 4;
      target.imageData.data.set(source.subarray(offset, offset + 4), destination);
    }
    bounds.forEach(function (box) {
      box.piece.canvas.getContext('2d').putImageData(box.imageData, 0, 0);
    });
    return pieces;
  }

  function separateLayer(layer) {
    if (!layer || !layer.visible || state.layers.indexOf(layer) < 0 || !(layer.splitPaths || []).length) {
      showToast('先选择一张已切割的图片');
      return;
    }
    var pieces = makeLayerPieces(layer);
    if (pieces.length < 2) {
      showToast('至少保留两个非透明区域，才能拆成独立图片');
      return;
    }
    commitHistory();
    var index = state.layers.indexOf(layer);
    state.layers.splice.apply(state.layers, [index, 1].concat(pieces));
    state.selectedId = pieces[0].id;
    setToolMode('move');
    showToast('已拆成 ' + pieces.length + ' 张图片，可单独拖动或勾选后拼接');
  }

  function separateContextLayer() {
    var target = state.contextTarget;
    closeContextMenu(true);
    if (target) separateLayer(target.layer);
  }

  function stitchLayers() {
    return state.layers.filter(function (layer) {
      return layer.visible && layer.stitchIncluded !== false;
    });
  }

  function autoRemoveBackground(layer) {
    if (!layer) return 0;
    var samples = [
      [0, 0],
      [layer.width - 1, 0],
      [0, layer.height - 1],
      [layer.width - 1, layer.height - 1],
      [Math.floor(layer.width / 2), 0],
      [Math.floor(layer.width / 2), layer.height - 1],
      [0, Math.floor(layer.height / 2)],
      [layer.width - 1, Math.floor(layer.height / 2)]
    ];
    var usedColors = {};
    var changed = 0;
    var amount = Number(tolerance ? tolerance.value : 32);
    samples.forEach(function (sample) {
      var pixel = layer.canvas.getContext('2d').getImageData(sample[0], sample[1], 1, 1).data;
      if (pixel[3] === 0) return;
      var key = [Math.round(pixel[0] / 8), Math.round(pixel[1] / 8), Math.round(pixel[2] / 8)].join(':');
      if (usedColors[key]) return;
      usedColors[key] = true;
      changed += removeSimilarColorAt(layer, { x: layer.x + sample[0], y: layer.y + sample[1] }, amount);
    });
    return changed;
  }

  function combineLayers(keepPositions) {
    var sources = [];
    var pieces = [];
    stitchLayers().forEach(function (layer) {
      var next = makeLayerPieces(layer);
      if (!next.length) return;
      sources.push(layer);
      pieces = pieces.concat(next);
    });
    if (pieces.length < 2) {
      showToast('请在图层中勾选至少两张可见图片，或先把一张图片切成两块');
      return;
    }
    var left = 0;
    var top = 0;
    var width = 0;
    var height = 0;
    if (keepPositions) {
      left = Math.min.apply(Math, pieces.map(function (piece) { return Math.round(piece.x); }));
      top = Math.min.apply(Math, pieces.map(function (piece) { return Math.round(piece.y); }));
      width = Math.max.apply(Math, pieces.map(function (piece) { return Math.round(piece.x) + piece.width; })) - left;
      height = Math.max.apply(Math, pieces.map(function (piece) { return Math.round(piece.y) + piece.height; })) - top;
    } else if (state.stitch === 'horizontal') {
      width = pieces.reduce(function (sum, piece) { return sum + piece.width; }, 0);
      height = pieces.reduce(function (max, piece) { return Math.max(max, piece.height); }, 0);
    } else {
      width = pieces.reduce(function (max, piece) { return Math.max(max, piece.width); }, 0);
      height = pieces.reduce(function (sum, piece) { return sum + piece.height; }, 0);
    }
    var mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = width;
    mergedCanvas.height = height;
    var mergedCtx = mergedCanvas.getContext('2d');
    var cursor = 0;
    pieces.forEach(function (piece) {
      if (keepPositions) mergedCtx.drawImage(piece.canvas, Math.round(piece.x) - left, Math.round(piece.y) - top);
      else if (state.stitch === 'horizontal') {
        mergedCtx.drawImage(piece.canvas, cursor, Math.floor((height - piece.height) / 2));
        cursor += piece.width;
      } else {
        mergedCtx.drawImage(piece.canvas, Math.floor((width - piece.width) / 2), cursor);
        cursor += piece.height;
      }
    });
    var merged = {
      id: makeId(),
      name: '拼接图片（' + pieces.length + '块）',
      x: keepPositions ? left : Math.round((960 - width) / 2),
      y: keepPositions ? top : Math.round((640 - height) / 2),
      width: mergedCanvas.width,
      height: mergedCanvas.height,
      canvas: mergedCanvas,
      visible: true,
      stitchIncluded: true,
      splitPaths: []
    };
    commitHistory();
    var lastSource = sources[sources.length - 1];
    var nextLayers = [];
    state.layers.forEach(function (layer) {
      if (sources.indexOf(layer) < 0) nextLayers.push(layer);
      else if (layer === lastSource) nextLayers.push(merged);
    });
    state.layers = nextLayers;
    state.selectedId = merged.id;
    setToolMode('move');
    showToast((keepPositions ? '已按当前位置合成一张图' : '已贴边拼接成一张图') +
      '，保留原始像素，可继续编辑或导出');
  }

  function applyStitch() {
    combineLayers(false);
  }

  function clearAll() {
    if (!state.layers.length) return;
    state.pendingSplit = null;
    state.splitSelection = null;
    commitHistory();
    state.layers = [];
    state.selectedId = null;
    renderAll();
    showToast('画布已清空');
  }

  // Trim only outside transparency; keep internal holes and merged layouts intact.
  function croppedContent(layer) {
    var data = layer.canvas.getContext('2d').getImageData(0, 0, layer.width, layer.height).data;
    var left = layer.width, top = layer.height, right = -1, bottom = -1;
    for (var index = 0; index < layer.width * layer.height; index += 1) {
      if (!data[index * 4 + 3]) continue;
      var x = index % layer.width, y = Math.floor(index / layer.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
    return right < 0 ? null : { canvas: layer.canvas, left: left, top: top, width: right - left + 1, height: bottom - top + 1 };
  }

  function exportPng() {
    var images = state.layers.filter(function (layer) { return layer.visible; }).map(croppedContent).filter(Boolean);
    if (!images.length) {
      showToast(state.layers.length ? '没有可导出的可见内容，请显示图片或撤销删除' : '请先导入图片');
      return;
    }
    var output = document.createElement('canvas');
    output.width = images.reduce(function (width, image) { return Math.max(width, image.width); }, 0);
    output.height = images.reduce(function (height, image) { return height + image.height; }, 0);
    var outputCtx = output.getContext('2d');
    var cursor = 0;
    images.forEach(function (image) {
      outputCtx.drawImage(image.canvas, image.left, image.top, image.width, image.height,
        Math.floor((output.width - image.width) / 2), cursor, image.width, image.height);
      cursor += image.height;
    });
    output.toBlob(function (blob) {
      if (!blob) { showToast('导出失败，请减少图片数量后重试'); return; }
      showToast('正在保存到桌面“任意裁”文件夹…');
      window.RenyiExport.save(blob).then(function () {
        showToast((images.length > 1 ? '已自动竖向拼接并保存' : '已裁剪并保存') +
          '到桌面“任意裁” · ' + output.width + ' × ' + output.height + ' px');
      }).catch(function (error) { showToast(error.message); });
    }, 'image/png');
  }

  function autoBackgroundAndExport() {
    var layer = selectedLayer();
    if (!layer) {
      showToast('请先选择要去背的图片');
      return;
    }
    state.pendingSplit = null;
    state.splitSelection = null;
    commitHistory();
    var changed = autoRemoveBackground(layer);
    renderAll();
    if (!changed) {
      state.history.pop();
      showToast('没有找到可去除的边缘背景');
      return;
    }
    showToast('背景已变透明，正在导出');
    exportPng();
  }

  function openHelp() {
    if (helpModal) {
      helpModal.hidden = false;
      document.body.classList.add('modal-open');
    }
  }

  function closeHelp() {
    if (helpModal) {
      helpModal.hidden = true;
      document.body.classList.remove('modal-open');
    }
  }

  function wireEvents() {
    document.getElementById('zoomInBtn').addEventListener('click', function () { setZoom(view.scale * 1.25); });
    document.getElementById('zoomOutBtn').addEventListener('click', function () { setZoom(view.scale / 1.25); });
    document.getElementById('zoomActualBtn').addEventListener('click', function () { setZoom(1); });
    document.getElementById('fitCanvasBtn').addEventListener('click', fitCanvasView);
    canvasWrap.addEventListener('wheel', function (event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event);
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(function () { layoutView(); }).observe(canvasWrap);
    var clickInput = function () { if (fileInput) fileInput.click(); };
    ['importBtn', 'addMoreBtn', 'stripAddBtn', 'emptyImportBtn'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) button.addEventListener('click', clickInput);
    });
    if (fileInput) {
      fileInput.addEventListener('change', function (event) {
        loadFiles(event.target.files);
        event.target.value = '';
      });
    }
    var exportButton = document.getElementById('exportBtn');
    var clearButton = document.getElementById('clearBtn');
    var undoButton = document.getElementById('undoBtn');
    var redoButton = document.getElementById('redoBtn');
    var autoBgButton = document.getElementById('autoBgBtn');
    var splitModeButtons = document.querySelectorAll('[data-split-mode]');
    var helpButton = document.getElementById('helpBtn');
    var closeHelpButton = document.getElementById('closeHelpBtn');
    if (exportButton) exportButton.addEventListener('click', exportPng);
    if (clearButton) clearButton.addEventListener('click', clearAll);
    if (undoButton) undoButton.addEventListener('click', undo);
    if (redoButton) redoButton.addEventListener('click', redo);
    if (autoBgButton) autoBgButton.addEventListener('click', autoBackgroundAndExport);
    if (helpButton) helpButton.addEventListener('click', openHelp);
    if (closeHelpButton) closeHelpButton.addEventListener('click', closeHelp);
    if (helpModal) {
      helpModal.addEventListener('click', function (event) {
        if (event.target === helpModal) closeHelp();
      });
    }
    if (deleteSelectionButton) deleteSelectionButton.addEventListener('click', deleteSelectedRegion);
    if (contextDeleteButton) contextDeleteButton.addEventListener('click', deleteContextTarget);
    if (contextClearCutsButton) contextClearCutsButton.addEventListener('click', clearContextCuts);
    if (contextSeparateButton) contextSeparateButton.addEventListener('click', separateContextLayer);
    if (separateButton) separateButton.addEventListener('click', function () { separateLayer(selectedLayer()); });
    var contextCancelButton = document.getElementById('contextCancelBtn');
    if (contextCancelButton) contextCancelButton.addEventListener('click', function () {
      closeContextMenu(true);
      cancelActiveSplit();
    });
    canvas.addEventListener('contextmenu', openContextMenu);
    document.addEventListener('pointerdown', function (event) {
      if (imageContextMenu && !imageContextMenu.contains(event.target)) closeContextMenu();
    }, true);
    window.addEventListener('resize', function () { closeContextMenu(); layoutView(); });
    window.addEventListener('blur', function () { closeContextMenu(); });
    document.addEventListener('scroll', function (event) {
      if (!imageContextMenu || !imageContextMenu.contains(event.target)) closeContextMenu();
    }, true);
    if (imageContextMenu) imageContextMenu.addEventListener('keydown', function (event) {
      if (event.key === 'Tab') {
        closeContextMenu(true);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      var items = Array.from(imageContextMenu.querySelectorAll('[role="menuitem"]')).filter(function (item) {
        return !item.hidden;
      });
      var index = items.indexOf(document.activeElement);
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = items.length - 1;
      else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[index].focus();
    });
    splitModeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.splitMode = button.dataset.splitMode || 'freehand';
        splitModeButtons.forEach(function (item) { item.classList.toggle('active', item === button); });
        if (splitModeValue) splitModeValue.textContent = state.splitMode === 'straight' ? '直线预览' : '自由轨迹';
        if (state.pendingSplit || state.splitSelection) cancelActiveSplit();
        renderAll();
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeContextMenu(true);
        closeHelp();
        if (state.pendingSplit || state.splitSelection) cancelActiveSplit();
      }
      var activeTag = document.activeElement && document.activeElement.tagName;
      var editingText = activeTag === 'INPUT' || activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable);
      if (event.key === 'Delete' && !editingText &&
        (!helpModal || helpModal.hidden) &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        if (state.splitSelection && state.splitSelection.regionMask) {
          event.preventDefault();
          deleteSelectedRegion();
        } else if (state.mode === 'split' && selectedLayer() && (selectedLayer().splitPaths || []).length) {
          event.preventDefault();
          showToast('先点击或右键选择要删除的切割区域');
        } else if (selectedLayer()) {
          event.preventDefault();
          deleteLayer(selectedLayer());
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
    });

    document.querySelectorAll('.tool-button').forEach(function (button) {
      button.addEventListener('click', function () {
        if (state.pendingSplit || state.splitSelection) cancelActiveSplit();
        state.mode = button.dataset.mode || 'move';
        document.querySelectorAll('.tool-button').forEach(function (item) {
          item.classList.toggle('active', item === button);
        });
        renderAll();
      });
    });
    document.querySelectorAll('[data-stitch]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.stitch = button.dataset.stitch || 'horizontal';
        document.querySelectorAll('[data-stitch]').forEach(function (item) {
          item.classList.toggle('active', item === button);
        });
      });
    });
    var stitchButton = document.getElementById('stitchBtn');
    if (stitchButton) stitchButton.addEventListener('click', applyStitch);
    var mergeButton = document.getElementById('mergePositionBtn');
    if (mergeButton) mergeButton.addEventListener('click', function () { combineLayers(true); });
    var resetButton = document.getElementById('resetViewBtn');
    if (resetButton) {
      resetButton.addEventListener('click', function () {
        state.pendingSplit = null;
        state.splitSelection = null;
        if (state.layers.length) commitHistory();
        state.layers.forEach(fitLayer);
        renderAll();
        fitCanvasView();
        showToast('画布位置已重置');
      });
    }
    if (brushSize) brushSize.addEventListener('input', function () {
      if (brushSizeValue) brushSizeValue.textContent = brushSize.value + ' px';
    });
    if (tolerance) tolerance.addEventListener('input', function () {
      if (toleranceValue) toleranceValue.textContent = tolerance.value;
    });

    var drawing = false;
    var activeLayer = null;
    var lastPoint = null;
    var splitPoints = [];
    var activePointerId = null;
    var splitMoved = false;
    var pointerStart = null;

    function pathLength(points) {
      var length = 0;
      for (var index = 1; index < points.length; index += 1) {
        length += Math.hypot(
          points[index].x - points[index - 1].x,
          points[index].y - points[index - 1].y
        );
      }
      return length;
    }

    canvas.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || drawing) return;
      canvas.focus({ preventScroll: true });
      var point = canvasPoint(event);
      if (state.mode === 'split') {
        state.splitSelection = null;
        activeLayer = hitLayer(point, true) || selectedLayer();
        if (!activeLayer || !activeLayer.visible) return;
        state.selectedId = activeLayer.id;
        drawing = true;
        activePointerId = event.pointerId;
        splitMoved = false;
        pointerStart = { x: event.clientX, y: event.clientY };
        splitPoints = [point];
        lastPoint = point;
        state.pendingSplit = { layer: activeLayer, points: splitPoints };
        canvas.setPointerCapture(event.pointerId);
        renderAll();
        return;
      }
      state.splitSelection = null;
      if (state.mode === 'bg') {
        activeLayer = hitLayer(point);
        if (activeLayer) {
          state.selectedId = activeLayer.id;
          commitHistory();
          var changed = removeSimilarColor(activeLayer, point);
          if (!changed) state.history.pop();
          renderAll();
        }
        return;
      }
      activeLayer = hitLayer(point, state.mode === 'move');
      if (!activeLayer) return;
      state.selectedId = activeLayer.id;
      drawing = true;
      activePointerId = event.pointerId;
      lastPoint = point;
      canvas.setPointerCapture(event.pointerId);
      commitHistory();
      renderAll();
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!drawing || !activeLayer || event.pointerId !== activePointerId) return;
      var point = canvasPoint(event);
      if (state.mode === 'split') {
        if (!state.pendingSplit) return;
        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) splitMoved = true;
        if (state.splitMode === 'straight') {
          state.pendingSplit.points = [splitPoints[0], point];
        } else if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 2) {
          splitPoints.push(point);
          state.pendingSplit.points = splitPoints;
        }
      } else if (state.mode === 'erase') {
        var distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        var steps = Math.max(1, Math.ceil(distance / 8));
        for (var i = 1; i <= steps; i += 1) {
          eraseAt(activeLayer, {
            x: lastPoint.x + (point.x - lastPoint.x) * i / steps,
            y: lastPoint.y + (point.y - lastPoint.y) * i / steps
          });
        }
      } else {
        activeLayer.x += point.x - lastPoint.x;
        activeLayer.y += point.y - lastPoint.y;
      }
      lastPoint = point;
      drawCanvas();
    });
    var stopPointer = function (event) {
      if (!drawing || event.pointerId !== activePointerId ||
        (event.type === 'pointerup' && event.button !== 0)) return;
      drawing = false;
      activePointerId = null;
      if (event.type === 'pointercancel' && state.mode === 'split') {
        state.pendingSplit = null;
        activeLayer = null;
        try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* no-op */ }
        renderAll();
        return;
      }
      if (state.mode === 'split' && state.pendingSplit) {
        var line = state.pendingSplit;
        var points = line.points || [];
        var endPoint = canvasPoint(event);
        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) splitMoved = true;
        if (state.splitMode === 'straight') points = [points[0], endPoint];
        else if (splitMoved && Math.hypot(endPoint.x - points[points.length - 1].x,
          endPoint.y - points[points.length - 1].y) > 0.01) points.push(endPoint);
        var length = pathLength(points);
        activeLayer = null;
        try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* no-op */ }
        state.pendingSplit = null;
        if (splitMoved && length > 0.5) {
          addSplitPath(line.layer, points);
          renderAll();
        } else {
          if (!selectSplitRegion(endPoint)) renderAll();
        }
        return;
      }
      activeLayer = null;
      try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* no-op */ }
      if (state.mode === 'move') {
        state.layers.forEach(function (layer) { layer.x = Math.round(layer.x); layer.y = Math.round(layer.y); });
      }
      renderAll();
    };
    canvas.addEventListener('pointerup', stopPointer);
    canvas.addEventListener('pointercancel', stopPointer);

    ['dragenter', 'dragover'].forEach(function (eventName) {
      if (!dropZone) return;
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
      if (!dropZone) return;
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropZone.classList.remove('drag-over');
      });
    });
    if (dropZone) {
      dropZone.addEventListener('drop', function (event) {
        loadFiles(event.dataTransfer ? event.dataTransfer.files : []);
      });
    }
  }

  wireEvents();
  renderAll();
  layoutView();
}());
