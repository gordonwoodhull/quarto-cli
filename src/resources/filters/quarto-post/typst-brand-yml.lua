function render_typst_brand_yml()
  if not _quarto.format.isTypstOutput() then
    return {}
  end

  local function sortedPairs(t, f)
    local a = {}
    for n in pairs(t) do table.insert(a, n) end
    table.sort(a, f)
    local i = 0      -- iterator variable
    local iter = function()   -- iterator function
        i = i + 1
        if a[i] == nil then return nil
        else return a[i], t[a[i]]
        end
    end
    return iter
  end

  local function to_typst_dict_indent(tab, curr, indent)
    curr = curr or ''
    indent = indent or '  '
    local entries = {}
    local inside = curr .. indent
    for k, v in sortedPairs(tab) do
      if type(v) == 'table' then
        v = to_typst_dict_indent(v, inside, indent)
      end
      if k and v then
        table.insert(entries, k .. ': ' .. v)
      end
    end
    if #entries == 0 then return nil end
    return '(\n' .. inside .. table.concat(entries, ',\n' .. inside) .. '\n' .. curr .. ')'
  end

  return {
    Pandoc = function(pandoc)
      local brand = param('brand')
      if not brand then return nil end

      -- logo
      if brand.logo then
        local logo = brand.logo
        if type(logo) ~= 'string' then
          if logo.large then
            logo = logo.large
          end
          -- and dark/light
        end
        if logo then
          quarto.doc.include_text('page-level',
            '#set page(background: align(top+left, box(inset: 0.5in, image("' .. logo .. '", width: 2in))))')
        end
      end

      -- color
      if brand.color and brand.color.palette then
        local palette = {}
        for name, color in pairs(brand.color.palette) do
          palette[name] = output_typst_color(parse_css_color(color))
        end
        local decl = '#let brand-palette = ' .. to_typst_dict_indent(palette)
        quarto.doc.include_text('page-level', decl)
      end
      if brand.color and brand.color.theme then
        local BACKGROUND_OPACITY = 0.1
        local theme = {}
        local themebk = {}
        for name, color in pairs(brand.color.theme) do
          color = brand.color.palette and brand.color.palette[color] or color
          theme[name] = output_typst_color(parse_css_color(color))
          themebk[name] = output_typst_color(parse_css_color(color),
            {unit = 'fraction', value = BACKGROUND_OPACITY})
        end
        local decl = '#let brand-theme = ' .. to_typst_dict_indent(theme)
        quarto.doc.include_text('page-level', decl)
        -- for demo purposes only, should implement backgroundcolor and fontcolor 
        if brand.color.theme.background then
          quarto.doc.include_text('page-level', '#set page(fill: brand-theme.background)')
        end
        if brand.color.theme.foreground then
          quarto.doc.include_text('page-level', '#set text(fill: brand-theme.foreground)')
        end
        local decl = '// theme colors at opacity ' .. BACKGROUND_OPACITY .. '\n#let brand-theme-background = ' .. to_typst_dict_indent(themebk)
        quarto.doc.include_text('page-level', decl)
      end

      -- typography
      if brand.typography then
        -- this is the only diagnostic Typst currently offers for font not found
        quarto.doc.include_text('page-level', '#set text(fallback: false)')
        local fontdir
        for target, font in pairs(brand.typography) do
          if target == 'font' then
            for _, entry in ipairs(brand.typography.font) do
              if entry['files'] then fontdir = '.' end
            end
            if not fontdir then
              quarto.log.warning('hacky brand.yml only supports font: file: right now')
            end
          else
            local family = font.family
            if target == 'headings' then            
              quarto.doc.include_text('page-level', '#show heading: set text(font: "' .. family .. '")')
              -- quarto.doc.include_text('page-level', '#show article: set text(font: "' .. family .. '")')
            elseif target == 'monospace' then            
              quarto.doc.include_text('page-level', '#show raw: set text(font: "' .. family .. '")')
            end
          end
        end
      end
    end,
    Meta = function(meta)
      local brand = param('brand')
      if brand and brand.typography and brand.typography.base then
        quarto.log.output('mainfont', brand.typography.base.family)
        meta['mainfont'] = brand.typography.base.family 
        return meta
      end
    end
  }
end

