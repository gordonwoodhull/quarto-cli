function render_typst_brand_yaml()
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

  local horz_to_typst = {
    left = "left",
    center = "center",
    right = "right",
  }
  local vert_to_typst = {
    top = "top",
    middle = "horizon",
    bottom = "bottom",
  }
  
  local function location_to_typst_align(location)
    local _, ndash = location:gsub('-', '')
    if ndash ~= 1 then return nil end
    local horz, vert = location:match '(%a+)--(%a+)'
    quarto.log.output('lota', horz, vert)
    if not horz_to_typst[horz] or not vert_to_typst[vert] then return nil end
    quarto.log.output('lota3', horz, vert)
    return horz_to_typst[horz] .. '+' .. vert_to_typst[vert]
  end  

  return {
    Pandoc = function(pandoc)
      local brand = param('brand')
      local raw_block_shown = false
      if brand and brand.processedData then
        -- color
        if brand.processedData.color and next(brand.processedData.color) then
          local brandColor = brand.processedData.color
          local colors = {}
          for name, _ in pairs(brandColor) do
            colors[name] = _quarto.modules.brand.get_color(name)
          end
          local decl = '#let brand-color = ' .. to_typst_dict_indent(colors)
          quarto.doc.include_text('in-header', decl)
          local BACKGROUND_OPACITY = 0.1
          local themebk = {}
          for name, _ in pairs(brandColor) do
            themebk[name] = _quarto.modules.brand.get_background_color(name, BACKGROUND_OPACITY)
          end
          -- for demo purposes only, should implement backgroundcolor and fontcolor
          if brandColor.background then
            quarto.doc.include_text('in-header', '#set page(fill: brand-color.background)')
          end
          if brandColor.foreground then
            quarto.doc.include_text('in-header', '#set text(fill: brand-color.foreground)')
          end
          local decl = '// theme colors at opacity ' .. BACKGROUND_OPACITY .. '\n#let brand-color-background = ' .. to_typst_dict_indent(themebk)
          quarto.doc.include_text('in-header', decl)
        end
        local function quote_string(value)
          if type(value) ~= 'string' then return value end
          return '"' .. value .. '"'
        end
        local function conditional_entry(key, value, quote_strings)
          if quote_strings == null then quote_strings = true end
          if not value then return '' end
          if quote_strings then value = quote_string(value) end
          return key .. ': ' .. value .. ', '
        end
        -- an approximation found here
        -- https://github.com/typst/typst/issues/159
        local function line_height_to_leading(lineHeight)
          if type(lineHeight) == 'number' then
            return (lineHeight - 0.75) .. 'em'
          else
            quarto.log.warn("don't know how to use line-height " .. lineHeight .. ", only numeric supported atm")
          end
        end
        -- typography
        local base = _quarto.modules.brand.get_typography('base')
        if base and (base.weight or base.style or base.color) then
            quarto.doc.include_text('in-header', table.concat({
              '#set text(',
              -- '#show par: set text(', has narrow effect than #show heading!
              conditional_entry('weight', base.weight),
              conditional_entry('style', base.style),
              conditional_entry('fill', base.color, false),
              ')'
            }))
        end
        if base and base['line-height'] then
          local lineHeight = base['line-height']
          local leading = line_height_to_leading(lineHeight)
          if leading then
            quarto.doc.include_text('in-header', table.concat({
              '#set par(leading: ', leading, ')'
            }))
          end
        end
        local headings = _quarto.modules.brand.get_typography('headings')
        if headings and (headings.weight or headings.style or headings.color) then
            quarto.doc.include_text('in-header', table.concat({
              '#show heading: set text(',
              conditional_entry('font', headings.family),
              conditional_entry('weight', headings.weight),
              conditional_entry('style', headings.style),
              conditional_entry('fill', headings.color, false),
              ')'
            }))
        end
        local monospaceInline = _quarto.modules.brand.get_typography('monospace-inline')
        if monospaceInline and monospaceInline.family then
            quarto.doc.include_text('in-header', table.concat({
              '#show raw.where(block: false): set text(',
              conditional_entry('font', monospaceInline.family),
              conditional_entry('weight', monospaceInline.weight),
              conditional_entry('style', monospaceInline.style),
              conditional_entry('fill', monospaceInline.color, false),
              ')'
            }))
        end
        local monospaceBlock = _quarto.modules.brand.get_typography('monospace-block')
        if monospaceBlock and monospaceBlock.family then
          quarto.doc.include_text('in-header', table.concat({
            '#show raw.where(block: true): set text(',
            conditional_entry('font', monospaceBlock.family),
            conditional_entry('weight', monospaceBlock.weight),
            conditional_entry('style', monospaceBlock.style),
            conditional_entry('fill', monospaceBlock.color, false),
            ')'
          }))
        end
        if monospaceBlock and monospaceBlock['background-color'] then
          raw_block_shown = true
          quarto.doc.include_text('in-header', table.concat({
            '#show raw.where(block: true): content => block(',
            conditional_entry('fill', monospaceBlock['background-color'], false),
            'width: 100%, inset: 8pt, radius: 2pt)[#content]'
          }))
        end
        if monospaceBlock and monospaceBlock['line-height'] then
          local lineHeight = monospaceBlock['line-height']
          local leading = line_height_to_leading(lineHeight)
          if leading then
            quarto.doc.include_text('in-header', table.concat({
              '#show raw.where(block: true): set par(leading: ', leading, ')'
            }))
          end
        end
        local link = _quarto.modules.brand.get_typography('link')
        if link and link.family then
          quarto.doc.include_text('in-header', table.concat({
            '#show link: set text(',
            conditional_entry('font', link.family),
            conditional_entry('weight', link.weight),
            conditional_entry('style', link.style),
            conditional_entry('size', link.size, false),
            conditional_entry('fill', link.color, false),
            ')'
          }))
        end
        -- logo
        local logo = param('logo')
        local logoOptions = {}
        local foundSrc = null
         if logo then
          if type(logo) == 'string' then
            foundSrc = _quarto.modules.brand.get_logo(logo) or logo
          elseif type(logo) == 'table' then
            for k, v in pairs(logo) do
              logoOptions[k] = v
            end
            if logo.src then
              foundSrc =  _quarto.modules.brand.get_logo(logo.src) or logo.src
            end
          end
        end
        if not foundSrc and brand.processedData.logo then
          local tries = {'large', 'small', 'medium'} -- low to high priority
          for _, try in ipairs(tries) do
            local src = _quarto.modules.brand.get_logo(try)
            if src then
              foundSrc = src
            end
          end
        end
        if foundSrc then
          if type(foundSrc) == "string" then
            logoOptions.src = foundSrc
          elseif foundSrc.light then
            logoOptions.src = foundSrc.light
          elseif foundSrc.dark then
            logoOptions.src = foundSrc.dark
          end
          -- todo: resolve logoOptions.src path
          logoOptions.padding = logoOptions.padding or '0.5in'
          logoOptions.width = logoOptions.width or '2in'
          logoOptions.location = logoOptions.location and
            location_to_typst_align(logoOptions.location) or 'left+top'
          quarto.log.debug('logo options', logoOptions)
          quarto.doc.include_text('in-header',
            '#set page(background: align(' .. logoOptions.location .. ', box(inset: ' .. logoOptions.padding .. ', image("' .. logoOptions.src .. '", width: ' .. logoOptions.width .. '))))')
        end  
      end
      if not raw_block_shown then
        quarto.doc.include_text('in-header', table.concat({
          '#show raw.where(block: true): block.with(',
          '    fill: luma(230),',
          '    width: 100%,',
          '    inset: 8pt,',
          '    radius: 2pt',
          '  )'
        }))
      end
    end,
    Meta = function(meta)
      meta.brand = meta.brand or {typography = {}}
      local base = _quarto.modules.brand.get_typography('base')
      if base and base.family then
        meta.brand.typography.base = {
          family = base.family,
          size = base.size,
        }
      end

      local headings = _quarto.modules.brand.get_typography('headings')
      if headings and headings.family then
        meta.brand.typography.headings = {
          family = headings.family,
          weight = headings.weight,
          style = headings.style,
          color = headings.color
          -- color gets mangled by pandoc template system because of hashes and quotes
        }
      end
      return meta
    end,
    Code = function(code)
      local monospaceInline = _quarto.modules.brand.get_typography('monospace-inline')
      if monospaceInline and monospaceInline['background-color'] then
        return pandoc.Inlines({
          pandoc.RawInline('typst', '#highlight(fill: ' .. monospaceInline['background-color'] .. ')['),
          code,
          pandoc.RawInline('typst', ']')
        })
      end
    end,
    Link = function(link)
      local linkTypography = _quarto.modules.brand.get_typography('link')
      if linkTypography and linkTypography.decoration then
        if linkTypography.decoration == 'underline' then
          return pandoc.Inlines({
            pandoc.RawInline('typst', '#underline['),
            link,
            pandoc.RawInline('typst', ']')
          })
        end
      end
    end
  }
end

