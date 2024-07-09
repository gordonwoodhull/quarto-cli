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
      if brand.color and brand.color.palette then
        local palette = {}
        for name, color in pairs(brand.color.palette) do
          palette[name] = output_typst_color(parse_css_color(color))
        end
        local decl = '#let brand-palette = ' .. to_typst_dict_indent(palette)
        quarto.doc.include_text('before-body', decl)
      end
      if brand.color and brand.color.theme then
        local theme = {}
        for name, color in pairs(brand.color.theme) do
          theme[name] = output_typst_color(parse_css_color(color))
        end
        local decl = '#let brand-theme = ' .. to_typst_dict_indent(theme)
        quarto.doc.include_text('before-body', decl)
      end
    end
  }
end

