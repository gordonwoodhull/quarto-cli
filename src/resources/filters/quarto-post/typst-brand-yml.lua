function render_typst_brand_yml()
  if not _quarto.format.isTypstOutput() then
    return {}
  end
  return {
    Pandoc = function(pandoc)
      local brand = param('brand')
      local lines = {}
      if brand.color and brand.color.palette then
        table.insert(lines, '#let brand-palette = (')
        for name, color in pairs(brand.color.palette) do
          table.insert(lines, '  ' .. name .. ': ' .. output_typst_color(parse_css_color(color)) .. ',')
        end
        table.insert(lines, ')')
        quarto.doc.include_text('before-body', table.concat(lines, '\n'))
      end
    end
  }
end

