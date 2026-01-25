// Simple numbering for non-book documents
#let quarto-equation-numbering = "(1)"
#let quarto-callout-numbering = "1"
#let quarto-subfloat-numbering(n-super, subfloat-idx) = {
  numbering("1a", n-super, subfloat-idx)
}

// Theorem configuration for theorion
// Simple numbering for non-book documents (no heading inheritance)
#let quarto-theorem-inherited-levels = 0

// Theorem numbering format (can be overridden by extensions for appendix support)
// This function returns the numbering pattern to use
#let quarto-theorem-numbering(loc) = "1.1"

// Default theorem render function
#let quarto-theorem-render(prefix: none, title: "", full-title: auto, body) = {
  if full-title != "" and full-title != auto and full-title != none {
    strong[#full-title.]
    h(0.5em)
  }
  body
}
