(function () {
  'use strict';
  var session = document.querySelector('meta[name="renyicai-session"]');
  var destination = document.querySelector('meta[name="renyicai-export-directory"]');
  var status = document.getElementById('exportDestination');
  var openButton = document.getElementById('openExportFolderBtn');
  if (status) {
    status.textContent = session ? '保存位置：桌面 / 任意裁' : '请双击“启动任意裁.cmd”启用桌面自动保存';
    status.title = destination ? destination.content : '';
  }
  if (openButton) openButton.hidden = !session;

  async function request(endpoint, blob) {
    if (!session) throw new Error('请双击“启动任意裁.cmd”打开编辑器，再导出到桌面“任意裁”文件夹');
    var response;
    try {
      response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin',
        headers: Object.assign({ 'X-Renyicai-Token': session.content }, blob ? { 'Content-Type': 'image/png' } : {}),
        body: blob });
    } catch (error) { throw new Error('本机保存服务未连接，请重新双击“启动任意裁.cmd”后重试'); }
    var result;
    try { result = await response.json(); }
    catch (error) { throw new Error('保存结果无法确认，请检查桌面“任意裁”文件夹后重试'); }
    if (!response.ok) throw new Error(result.error || '保存失败，请稍后重试');
    return result;
  }

  window.RenyiExport = {
    save: async function (blob) {
      var result = await request('/api/export', blob);
      if (!result.fileName || !result.path) throw new Error('保存结果无法确认，请检查桌面“任意裁”文件夹');
      if (status) {
        status.textContent = '已保存：' + result.fileName;
        status.title = result.path;
      }
      return result;
    }
  };
  if (openButton) openButton.addEventListener('click', function () {
    request('/api/open-folder').catch(function (error) {
      if (status) status.textContent = error.message;
    });
  });
}());
