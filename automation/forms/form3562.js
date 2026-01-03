// Module: form3562
// Handles insertion for form 3562. Implements selector 915, campo 907, selector 908
// and fields 909..914 based on the provided table layout.
module.exports.processRow = async function(page, rowData, index, helpers = {}) {
  const emitLog = helpers.emitLog || (() => {});
  const randomDelay = helpers.randomDelay || (async () => {});
  const fastType = helpers.fastType || (async () => {});

  emitLog('info','step',`Procesando fila ${index + 1} (form3562)`);
  try {
    await randomDelay(8, 25);

    // Locate section containing form detail
    const section = page.locator('.fw-seccionFormulario');

    // --- Selector 1 (915) ---
    const candidates = ['915','915_val','cod915','code915','915_code','producto','prod','codigo','prod_codigo','915_desc'];
    let rawVal = '';
    for (const k of candidates) { if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') { rawVal = String(rowData[k]).trim(); break; } }
    if (!rawVal) emitLog('warning','insertion',`No se proporcionó valor para selector 915 (fila ${index + 1})`);

    let selected = false;
    if (rawVal) {
      const xpathSelectFirst = "(.//td[contains(@class,'fw-valorCampo')]//select)[1]";
      let selCount = 0;
      try { selCount = await section.locator(`xpath=${xpathSelectFirst}`).count(); } catch (e) { selCount = 0; }
      if (selCount > 0) {
        const sel = section.locator(`xpath=${xpathSelectFirst}`).first();
        try { await sel.waitFor({ state: 'visible', timeout: 1500 }); } catch (e) {}
        try { await sel.selectOption(rawVal); selected = true; emitLog('info','insertion',`915 selectOption(value) OK: ${rawVal}`); } catch (e) {}
        if (!selected) {
          try { await sel.selectOption({ label: rawVal }); selected = true; emitLog('info','insertion',`915 selectOption(label) OK: ${rawVal}`); } catch (e) {}
        }
        if (!selected) {
          try {
            const options = await sel.evaluate((el) => Array.from(el.options).map(o => ({ value: o.value, label: o.label || o.textContent || o.innerText || '' })));
            const numMatch = (rawVal||'').match(/^\s*(\d{1,6})/);
            const leading = numMatch ? numMatch[1] : null;
            let match = options.find(o => o.value === rawVal || (o.label && o.label.trim() === rawVal));
            if (!match && leading) match = options.find(o => (o.label && o.label.indexOf(leading) !== -1) || (String(o.value) === leading));
            if (!match) {
              const rv = rawVal.toLowerCase();
              match = options.find(o => (o.label && o.label.toLowerCase().includes(rv)) || (String(o.value) && String(o.value).toLowerCase().includes(rv)));
            }
            if (match) {
              await sel.evaluate((el,v)=>{ el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, match.value);
              selected = true;
              emitLog('info','insertion',`915 establecido por evaluate: value='${match.value}', label='${match.label}'`);
            }
          } catch (e) { emitLog('warning','insertion',`Error evaluando opciones 915: ${e.message}`); }
        }
      } else {
        const xpathCell = "(.//td[contains(@class,'fw-valorCampo')])[1]";
        try {
          const cell = section.locator(`xpath=${xpathCell}`).first();
          try { await cell.click({ timeout: 1000 }); await randomDelay(5, 15); } catch (e) {}
          const exact = page.locator(`text="${rawVal}"`).first();
          if (await exact.count() > 0) { await exact.click(); selected = true; emitLog('info','insertion',`915 custom: click exact text ${rawVal}`); }
          else {
            const parts = rawVal.split(/\s*-\s*/).map(s=>s.trim()).filter(Boolean);
            const tryText = parts.length ? parts[0] : rawVal;
            const partial = page.locator(`text=${tryText}`).first();
            if (await partial.count() > 0) { await partial.click(); selected = true; emitLog('info','insertion',`915 custom: click partial '${tryText}'`); }
          }
        } catch (e) { emitLog('warning','insertion',`No se pudo interactuar control custom 915: ${e.message}`); }
      }
      if (!selected) emitLog('warning','insertion',`No se pudo seleccionar '${rawVal}' en 915 (fila ${index + 1})`);
    }

    // --- Campo [907] (numero + DV) --- (re-using existing robust parsing)
    try {
      const rawNumCandidates = ['907_num','907','num907','rut907','RUT907','doc907','907_rut','rut'];
      const rawDvCandidates = ['907_dv','907dv','dv907','dv','DV','907_dev','097_dev','907-dev','907dev'];
      let rawNum = '';
      for (const k of rawNumCandidates) { if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') { rawNum = String(rowData[k]).trim(); break; } }
      let dv = '';
      for (const k of rawDvCandidates) { if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') { dv = String(rowData[k]).trim(); break; } }
      let num = rawNum;
      if ((!dv || dv.length === 0) && rawNum) {
        const m = rawNum.match(/^\s*([0-9\.\s]+)\s*[-–—]?\s*([0-9Kk])\s*$/);
        if (m) { num = m[1].replace(/\.|\s+/g, ''); dv = m[2].toUpperCase(); }
        else {
          const cleaned = rawNum.replace(/\.|\s+/g, '');
          if (cleaned.length > 1) {
            const last = cleaned.slice(-1);
            const rest = cleaned.slice(0, -1);
            if (/^[0-9Kk]$/.test(last) && /^[0-9]+$/.test(rest)) { num = rest; dv = last.toUpperCase(); }
            else { num = cleaned; }
          } else { num = cleaned; }
        }
      } else { num = (num || rawNum || '').replace(/\.|\s+/g, ''); dv = (dv || '').toUpperCase(); }
      num = (num || '').toString(); dv = (dv || '').toString();

      if (num) {
        const xpathNum = "(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[2]//input[@maxlength='10' or not(@maxlength)]";
        const xpathDv = "(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[3]//input[@maxlength='1' or not(@maxlength)]";
        const cntNum = await section.locator(`xpath=${xpathNum}`).count();
        const cntDv = await section.locator(`xpath=${xpathDv}`).count();
        if (cntNum > 0) {
          const inputNum = section.locator(`xpath=${xpathNum}`).first();
          await inputNum.waitFor({ state: 'visible', timeout: 1500 });
          try { await inputNum.fill(''); } catch (e) {}
          await inputNum.fill(num);
          await randomDelay(5,15);
        }
        if (cntDv > 0 && dv) {
          const inputDv = section.locator(`xpath=${xpathDv}`).first();
          await inputDv.waitFor({ state: 'visible', timeout: 1500 });
          try { await inputDv.fill(''); } catch (e) {}
          await inputDv.fill(dv);
          await randomDelay(5,15);
          try { await inputDv.press('Tab'); } catch (e) { try { await page.keyboard.press('Tab'); } catch (e) {} }
        }
      }
    } catch (e) { emitLog('warning','insertion',`No se pudo insertar 907 para fila ${index + 1}: ${e.message}`); }

    // --- Selector [908] --- (already implemented, anchored relative to [915])
    try {
      const cand908 = ['908','908_val','cod908','code908','908_code','tipo908','tipo_doc2','tipo_doc','tipo'];
      let raw908 = '';
      for (const k of cand908) { if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') { raw908 = String(rowData[k]).trim(); break; } }
      if (raw908) {
        const xpathSelect908 = "(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')]//select)[2]";
        let selCount2 = 0;
        try { selCount2 = await section.locator(`xpath=${xpathSelect908}`).count(); } catch (e) { selCount2 = 0; }
        let selected908 = false;
        if (selCount2 > 0) {
          const sel2 = section.locator(`xpath=${xpathSelect908}`).first();
          try { await sel2.waitFor({ state: 'visible', timeout: 1500 }); } catch (e) {}
          try { await sel2.selectOption(raw908); selected908 = true; emitLog('info','insertion',`908 selectOption(value) OK: ${raw908}`); } catch (e) {}
          if (!selected908) {
            try { await sel2.selectOption({ label: raw908 }); selected908 = true; emitLog('info','insertion',`908 selectOption(label) OK: ${raw908}`); } catch (e) {}
          }
          if (!selected908) {
            try {
              const options = await sel2.evaluate((el) => Array.from(el.options).map(o => ({ value: o.value, label: o.label || o.text || '' })));
              const numMatch2 = (raw908||'').match(/^\s*(\d{1,6})/);
              const leading2 = numMatch2 ? numMatch2[1] : null;
              let matchOpt = options.find(o => o.value === raw908 || (o.label && o.label.trim() === raw908));
              if (!matchOpt && leading2) matchOpt = options.find(o => (o.label && o.label.indexOf(leading2) !== -1) || (String(o.value) === leading2));
              if (!matchOpt) {
                const rv = raw908.toLowerCase();
                matchOpt = options.find(o => (o.label && o.label.toLowerCase().includes(rv)) || (o.text && o.text.toLowerCase().includes(rv)));
              }
              if (matchOpt) {
                await sel2.evaluate((el,v)=>{ el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, matchOpt.value);
                selected908 = true;
                emitLog('info','insertion',`908 seleccionado por evaluate: ${matchOpt.value}`);
              }
            } catch (e) { emitLog('warning','insertion',`Error evaluando opciones 908: ${e.message}`); }
          }
        } else {
          // custom dropdown fallback
          const xpathCell908 = "(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[5]";
          try {
            const cell908 = section.locator(`xpath=${xpathCell908}`).first();
            try { await cell908.click({ timeout: 1000 }); await randomDelay(5,15); } catch (e) {}
            const optExact = page.locator(`text="${raw908}"`).first();
            if (await optExact.count() > 0) { await optExact.click(); selected908 = true; emitLog('info','insertion',`908 custom: clicked exact ${raw908}`); }
            else {
              const parts = raw908.split(/\s*-\s*/).map(s=>s.trim()).filter(Boolean);
              const tryText2 = parts.length ? parts[0] : raw908;
              const optPartial = page.locator(`text=${tryText2}`).first();
              if (await optPartial.count() > 0) { await optPartial.click(); selected908 = true; emitLog('info','insertion',`908 custom: clicked partial ${tryText2}`); }
            }
          } catch (e) { emitLog('warning','insertion',`No se pudo interactuar control custom 908: ${e.message}`); }
        }
        if (!selected908) emitLog('warning','insertion',`No se pudo seleccionar '${raw908}' en 908 (fila ${index + 1})`);
      }
    } catch (e) { emitLog('warning','insertion',`No se pudo insertar 908 para fila ${index + 1}: ${e.message}`); }

    // --- Campos 909..914 (inputs de texto en la misma fila de valores) ---
    const tailFields = [
      { candidates: ['909','fecha909','date909','909_fecha','909_date','909_val','field909','val909','campo909'], index: 5, isDate: true },
      { candidates: ['910','910_val','field910','val910','campo910','monto910','valor910'], index: 6, isDate: false },
      { candidates: ['911','911_val','field911','val911','campo911','monto911','valor911'], index: 7, isDate: false },
      { candidates: ['912','912_val','field912','val912','campo912','monto912','valor912'], index: 8, isDate: false },
      { candidates: ['913','913_val','field913','val913','campo913','monto913','valor913'], index: 9, isDate: false },
      { candidates: ['914','914_val','field914','val914','campo914','monto914','valor914'], index: 10, isDate: false }
    ];
    for (const f of tailFields) {
      try {
        let raw = '';
        let foundKey = '';
        for (const k of f.candidates) { 
          if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') { 
            raw = String(rowData[k]).trim(); 
            foundKey = k;
            break; 
          } 
        }
        
        if (f.index === 5) {
          emitLog('debug','insertion',`[909 DEBUG] foundKey: ${foundKey}, raw: "${raw}", isDate: ${f.isDate}`);
        }
        
        if (!raw) continue;
        
        let normalized = raw;
        
        // Normalize date format only for 909 (field index 5)
        if (f.isDate) {
          emitLog('debug','insertion',`[909 NORMALIZANDO] raw antes: "${raw}"`);
          
          // First replace ALL hyphens with slashes
          let temp = '';
          for (let i = 0; i < raw.length; i++) {
            temp += raw[i] === '-' ? '/' : raw[i];
          }
          normalized = temp;
          emitLog('debug','insertion',`[909 DESPUÉS REPLACE] normalized: "${normalized}"`);
          
          // Split and check if it looks like a date
          const dateParts = normalized.split('/');
          emitLog('debug','insertion',`[909 PARTES] dateParts: ${JSON.stringify(dateParts)}, length: ${dateParts.length}`);
          
          if (dateParts.length === 3) {
            const day = dateParts[0].trim();
            const month = dateParts[1].trim();
            let year = dateParts[2].trim();
            
            emitLog('debug','insertion',`[909 VALIDACIÓN] day:"${day}" /^\\d+$/: ${/^\d+$/.test(day)}, month:"${month}" /^\\d+$/: ${/^\d+$/.test(month)}, year:"${year}" /^\\d+$/: ${/^\d+$/.test(year)}`);
            
            // Validate that all parts are numeric
            if (/^\d+$/.test(day) && /^\d+$/.test(month) && /^\d+$/.test(year)) {
              // Convert 2-digit year to 4-digit year
              if (year.length === 2) {
                year = '20' + year;
              }
              
              normalized = `${day}/${month}/${year}`;
              emitLog('info','insertion',`Campo 909 fecha normalizada: "${raw}" -> "${normalized}"`);
            }
          }
        }
        
        const xpathField = `(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[${f.index}]//input`;
        const cnt = await section.locator(`xpath=${xpathField}`).count();
        if (cnt > 0) {
          const inp = section.locator(`xpath=${xpathField}`).first();
          await inp.waitFor({ state: 'visible', timeout: 1500 });
          try { await inp.fill(''); } catch (e) {}
          await inp.fill(normalized);
          await randomDelay(5, 20);
          emitLog('info','insertion',`Campo ${f.index} insertado: ${normalized}`);
        } else {
          emitLog('warning','insertion',`No se encontró input para campo con index ${f.index} (label [915])`);
        }
      } catch (e) { emitLog('warning','insertion',`Error insertando campo index ${f.index}: ${e.message}`); }
    }

    // --- Pulsar botón 'Agregar' (igual que en form3561) ---
    try {
      const agregarSelector = '#dj-agregar';
      const agregarCount = await page.locator(agregarSelector).count();
      if (agregarCount > 0) {
        const agregarBtn = page.locator(agregarSelector).first();
        await agregarBtn.waitFor({ state: 'visible', timeout: 1500 });
        await agregarBtn.click();
        await randomDelay(5, 15);
        emitLog('info','insertion','Botón Agregar pulsado (form3562)');
      } else {
        emitLog('warning','insertion','No se encontró el botón Agregar (#dj-agregar) en form3562');
      }
    } catch (e) { emitLog('warning','insertion',`Error al pulsar Agregar en form3562: ${e.message}`); }

    // Esperar que el formulario reinicie el detalle (ej: que 907 quede vacío)
    try {
      const xpathNumWait = "(.//tr[.//div[normalize-space(text())='[915]']]/following-sibling::tr[1]//td[contains(@class,'fw-valorCampo')])[2]//input[@maxlength='10' or not(@maxlength)]";
      const input907 = section.locator(`xpath=${xpathNumWait}`).first();
      const maxWait = 500; // ms
      const poll = 100;
      let waited = 0;
      while (waited < maxWait) {
        try {
          const val = await input907.inputValue();
          if (!val || val.trim() === '') break;
        } catch (e) {}
        await new Promise(r => setTimeout(r, poll));
        waited += poll;
      }
      if (waited >= maxWait) emitLog('warning','insertion','Timeout esperando reinicio tras Agregar (form3562)');
    } catch (e) {}

    return true;
  } catch (err) {
    emitLog('error','error',`Error form3562.processRow fila ${index + 1}: ${err.message}`, { index });
    return false;
  }
};
