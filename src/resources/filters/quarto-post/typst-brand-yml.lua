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
    end
  }
end

