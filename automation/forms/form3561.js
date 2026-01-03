// Module: form3561
// Exports: processRow(page, row, index, { emitLog, fastType, randomDelay })
module.exports.processRow = async function(page, rowData, index, helpers = {}) {
  const emitLog = helpers.emitLog || (() => {});
  const fastType = helpers.fastType || (async () => {});
  const randomDelay = helpers.randomDelay || (async () => {});
  emitLog('info','step',`Procesando fila ${index + 1} (form3561)`, { index });
  try {
    await randomDelay(10, 30);

    if (rowData.nombre) {
      await fastType(page, 'input[name="nombre"]', rowData.nombre);
    }
    if (rowData.email) {
      await fastType(page, 'input[name="email"]', rowData.email);
    }
    if (rowData.telefono) {
      await fastType(page, 'input[name="telefono"]', rowData.telefono);
    }

    // --- Insert 807 (num + dv) ---
    try {
      const rawNumCandidates = ['807_num','807','num807','rut','RUT','rut807','807_rut'];
      const rawDvCandidates = ['807_dv','807dv','dv807','dv','DV'];
      let rawNum = '';
      for (const k of rawNumCandidates) { if (rowData[k]) { rawNum = String(rowData[k]).trim(); break; } }
      let dv = '';
      for (const k of rawDvCandidates) { if (rowData[k]) { dv = String(rowData[k]).trim(); break; } }
      let num = rawNum;
      if ((!dv || dv.length === 0) && rawNum) {
        const m = rawNum.match(/^\s*([0-9\.\s]+)\s*[-–—]?\s*([0-9Kk])\s*$/);
        if (m) {
          num = m[1].replace(/\.|\s+/g, '');
          dv = m[2].toUpperCase();
        } else {
          const cleaned = rawNum.replace(/\.|\s+/g, '');
          if (cleaned.length > 1) {
            const last = cleaned.slice(-1);
            const rest = cleaned.slice(0, -1);
            if (/^[0-9Kk]$/.test(last) && /^[0-9]+$/.test(rest)) {
              num = rest; dv = last.toUpperCase();
            } else { num = cleaned; }
          } else { num = cleaned; }
        }
      } else {
        num = (num || rawNum || '').replace(/\.|\s+/g, '');
        dv = (dv || '').toUpperCase();
      }
      num = (num || '').toString(); dv = (dv || '').toString();

      if (num) {
        const section = page.locator('.fw-seccionFormulario');
        const xpathNum = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[1]//input[@maxlength='10']";
        const xpathDv = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[2]//input[@maxlength='1']";
        const cntNum = await section.locator(`xpath=${xpathNum}`).count();
        const cntDv = await section.locator(`xpath=${xpathDv}`).count();
        if (cntNum > 0) {
          const inputNum = section.locator(`xpath=${xpathNum}`).first();
          await inputNum.waitFor({ state: 'visible', timeout: 1500 });
          try { await inputNum.fill(''); } catch (e) {}
          await inputNum.fill(num);
          await randomDelay(5, 15);
        }
        if (cntDv > 0 && dv) {
          const inputDv = section.locator(`xpath=${xpathDv}`).first();
          await inputDv.waitFor({ state: 'visible', timeout: 1500 });
          try { await inputDv.fill(''); } catch (e) {}
          await inputDv.fill(dv);
          await randomDelay(5, 15);
          try { await inputDv.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
        }
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 807 para fila ${index + 1}: ${e.message}`);
    }

    // --- Insert 808 (selector) ---
    try {
      const valCandidates = ['808','808_val','cod808','code808','808_code','tipo808','tipo','tipo_doc','cod_tipo'];
      let rawVal = '';
      for (const k of valCandidates) { if (rowData[k]) { rawVal = String(rowData[k]).trim(); break; } }
      if (rawVal) {
        const section = page.locator('.fw-seccionFormulario');
        const xpathSelect = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[3]//select";
        const cntSelect = await section.locator(`xpath=${xpathSelect}`).count();
        emitLog('info','insertion',`   🔎 select [808] encontrado? count=${cntSelect}, buscando valor: '${rawVal}'`);
        let selected = false;
        if (cntSelect > 0) {
          const sel = section.locator(`xpath=${xpathSelect}`).first();
          await sel.waitFor({ state: 'visible', timeout: 1500 });
          try { await sel.selectOption(rawVal); selected = true; emitLog('info','insertion',`   ✅ selectOption por value exitoso: ${rawVal}`); } catch (e) { emitLog('warning','insertion',`   selectOption por value falló: ${e.message}`); }
          if (!selected) {
            try { await sel.selectOption({ label: rawVal }); selected = true; emitLog('info','insertion',`   ✅ selectOption por label exitoso: ${rawVal}`); } catch (e) { emitLog('warning','insertion',`   selectOption por label falló: ${e.message}`); }
          }
          if (!selected) {
            const options = await sel.evaluate((el) => Array.from(el.options).map((o, i) => ({ i, value: o.value, label: o.label || o.text || '', text: o.text || '' })));
            emitLog('info','insertion',`   Opciones del select 808: ${JSON.stringify(options.slice(0,40))}`);
            const numMatch = (rawVal || '').match(/^\s*(\d{1,4})/);
            const leadingNum = numMatch ? numMatch[1] : null;
            let matchOpt = options.find(o => o.value === rawVal || o.label === rawVal || o.text === rawVal);
            if (!matchOpt && leadingNum) matchOpt = options.find(o => (o.label && o.label.indexOf(leadingNum) !== -1) || (o.text && o.text.indexOf(leadingNum) !== -1) || (String(o.value) === leadingNum));
            if (!matchOpt) {
              const rv = rawVal.toLowerCase();
              matchOpt = options.find(o => (o.label && o.label.toLowerCase().includes(rv)) || (o.text && o.text.toLowerCase().includes(rv)));
            }
            if (matchOpt) {
              emitLog('info','insertion',`   Seleccionando opción: value='${matchOpt.value}', label='${matchOpt.label}'`);
              const setRes = await sel.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }, matchOpt.value);
              if (setRes) { selected = true; emitLog('info','insertion',`   ✅ Opción establecida por evaluate`); }
            } else {
              emitLog('warning','insertion',`   ❌ No se encontró opción que coincida con: '${rawVal}'`);
            }
          }
        } else {
          const xpathCell = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[3]";
          const cell = section.locator(`xpath=${xpathCell}`).first();
          try { await cell.click({ timeout: 1000 }); await randomDelay(5, 15); } catch (e) {}
          const optLocatorExact = page.locator(`text=${rawVal}`).first();
          try {
            if (await optLocatorExact.count() > 0) { await optLocatorExact.click(); selected = true; }
            else {
              const parts = rawVal.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
              const tryText = parts.length ? parts[0] : rawVal;
              const optPartial = page.locator(`text=${tryText}`).first();
              if (await optPartial.count() > 0) { await optPartial.click(); selected = true; }
            }
          } catch (e) {}
        }
        emitLog(selected ? 'info' : 'warning','insertion', (selected ? `808 seleccionado: ${rawVal}` : `No se pudo seleccionar 808 con valor '${rawVal}' en fila ${index + 1}`));
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 808 para fila ${index + 1}: ${e.message}`);
    }

    // --- Campo [809] fecha ---
    try {
      let desired809 = (rowData['809'] || '').toString();
      
      // Normalize date format to DD/MM/YYYY
      // Accepts: 25/11/2025, 25/11/25, 25-11-25, 25-11-2025
      desired809 = desired809.replace(/-/g, '/'); // Convert - to /
      
      // Handle 2-digit years: 25 -> 2025, 99 -> 2099, etc.
      const dateParts = desired809.split('/');
      if (dateParts.length === 3) {
        const day = dateParts[0];
        const month = dateParts[1];
        let year = dateParts[2];
        
        // If year is 2 digits, convert to 4 digits (assume 20xx)
        if (year.length === 2) {
          year = '20' + year;
        }
        
        desired809 = `${day}/${month}/${year}`;
      }
      
      if (desired809) {
        const section = page.locator('.fw-seccionFormulario');
        const input809Xpath = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[4]//input";
        const input809Count = await section.locator(`xpath=${input809Xpath}`).count();
        if (input809Count > 0) {
          const input809 = section.locator(`xpath=${input809Xpath}`).first();
          await input809.waitFor({ state: 'visible', timeout: 1500 });
          try { await input809.fill(''); } catch (e) {}
          await input809.fill(desired809);
          await randomDelay(5, 15);
          try { await input809.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
          emitLog('info','insertion',`809 pegado: ${desired809}`);
        } else {
          emitLog('warning','insertion',`No se encontró input [809] en la fila ${index + 1}`);
        }
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 809 para fila ${index + 1}: ${e.message}`);
    }

    // --- Campo [810] ---
    try {
      const desired810 = (rowData['810'] || '').toString();
      if (desired810) {
        const section = page.locator('.fw-seccionFormulario');
        const input810Xpath = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[5]//input";
        const input810Count = await section.locator(`xpath=${input810Xpath}`).count();
        if (input810Count > 0) {
          const input810 = section.locator(`xpath=${input810Xpath}`).first();
          await input810.waitFor({ state: 'visible', timeout: 1500 });
          try { await input810.fill(''); } catch (e) {}
          await input810.fill(desired810);
          await randomDelay(5, 15);
          try { await input810.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
          emitLog('info','insertion',`810 pegado: ${desired810}`);
        } else {
          emitLog('warning','insertion',`No se encontró input [810] en la fila ${index + 1}`);
        }
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 810 para fila ${index + 1}: ${e.message}`);
    }

    // --- Campo [811] ---
    try {
      const desired811 = (rowData['811'] || '').toString();
      if (desired811) {
        const section = page.locator('.fw-seccionFormulario');
        const input811Xpath = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[6]//input";
        const input811Count = await section.locator(`xpath=${input811Xpath}`).count();
        if (input811Count > 0) {
          const input811 = section.locator(`xpath=${input811Xpath}`).first();
          await input811.waitFor({ state: 'visible', timeout: 1500 });
          try { await input811.fill(''); } catch (e) {}
          const normalized811 = desired811.replace(/[^0-9-]/g, '');
          await input811.fill(normalized811);
          await randomDelay(5, 15);
          try { await input811.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
          emitLog('info','insertion',`811 pegado: ${normalized811}`);
        } else {
          emitLog('warning','insertion',`No se encontró input [811] en la fila ${index + 1}`);
        }
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 811 para fila ${index + 1}: ${e.message}`);
    }

    // --- Campo [812] ---
    try {
      const desired812 = (rowData['812'] || '1900').toString();
      const section = page.locator('.fw-seccionFormulario');
      const input812Xpath = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[7]//input";
      const input812Count = await section.locator(`xpath=${input812Xpath}`).count();
      if (input812Count > 0) {
        const input812 = section.locator(`xpath=${input812Xpath}`).first();
        await input812.waitFor({ state: 'visible', timeout: 1500 });
        try { await input812.fill(''); } catch (e) {}
        const normalized812 = desired812.replace(/[^0-9\-\.]/g, '');
        await input812.fill(normalized812);
        await randomDelay(5, 15);
        try { await input812.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
        emitLog('info','insertion',`812 pegado: ${normalized812}`);
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 812 para fila ${index + 1}: ${e.message}`);
    }

    // --- Campo [813] ---
    try {
      const desired813 = (rowData['813'] || '1900').toString();
      const section = page.locator('.fw-seccionFormulario');
      const input813Xpath = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[8]//input";
      const input813Count = await section.locator(`xpath=${input813Xpath}`).count();
      if (input813Count > 0) {
        const input813 = section.locator(`xpath=${input813Xpath}`).first();
        await input813.waitFor({ state: 'visible', timeout: 1500 });
        try { await input813.fill(''); } catch (e) {}
        const normalized813 = desired813.replace(/[^0-9\-\.]/g, '');
        await input813.fill(normalized813);
        await randomDelay(5, 15);
        try { await input813.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
        emitLog('info','insertion',`813 pegado: ${normalized813}`);
      }
    } catch (e) {
      emitLog('warning','insertion',`No se pudo insertar 813 para fila ${index + 1}: ${e.message}`);
    }

    // --- Pulsar botón 'Agregar' ---
    try {
      const agregarSelector = '#dj-agregar';
      const agregarCount = await page.locator(agregarSelector).count();
      if (agregarCount > 0) {
        const agregarBtn = page.locator(agregarSelector).first();
        await agregarBtn.waitFor({ state: 'visible', timeout: 1500 });
        await agregarBtn.click();
        await randomDelay(5, 15);
        emitLog('info','insertion','Botón Agregar pulsado');
      } else {
        emitLog('warning','insertion','No se encontró el botón Agregar (#dj-agregar)');
      }
    } catch (e) {
      emitLog('warning','insertion',`Error al pulsar Agregar en fila ${index + 1}: ${e.message}`);
    }

    // Esperar reinicio del formulario (campo 807 vacío)
    try {
      const section = page.locator('.fw-seccionFormulario');
      const xpathNum = "(.//tr[.//div[normalize-space(text())='[807]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[1]//input[@maxlength='10']";
      const input807Num = section.locator(`xpath=${xpathNum}`).first();
      const maxWait = 500;
      const pollInterval = 100;
      let waited = 0;
      while (waited < maxWait) {
        try {
          const current807 = await input807Num.inputValue();
          if (!current807 || current807.trim() === '') break;
        } catch (e) {}
        await new Promise(r => setTimeout(r, pollInterval));
        waited += pollInterval;
      }
      if (waited >= maxWait) emitLog('warning','insertion','Timeout esperando reinicio tras Agregar');
    } catch (e) {}

    emitLog('info','step',`Fila ${index + 1} procesada correctamente (form3561)`, { index });
    return true;
  } catch (error) {
    emitLog('error','error',`Fila ${index + 1} falló (form3561): ${error.message}`, { index });
    return false;
  }
};
