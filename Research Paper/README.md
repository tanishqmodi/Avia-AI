# Avia AI — Research Paper (IEEE format)

IEEE conference-format LaTeX source for the paper _"Avia AI: A Zone-Aware,
Multi-Model Framework for Real-Time Avian Intrusion Detection at Airports."_

## Files

| File              | Purpose                                      |
|-------------------|----------------------------------------------|
| `main.tex`        | Paper source (IEEEtran conference template)  |
| `references.bib`  | BibTeX bibliography                          |
| `figures/`        | Figures — currently referenced, to be added  |

## Building the PDF

You need a TeX distribution with `IEEEtran.cls`. On macOS this ships with
MacTeX; on Ubuntu install `texlive-publishers` and `texlive-bibtex-extra`.

```bash
cd "Research Paper"
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex    # second pass so cross-references resolve
```

Or via `latexmk`:

```bash
latexmk -pdf main.tex
```

The output is `main.pdf`.

## Overleaf

Upload `main.tex` and `references.bib` to a new Overleaf project, set the
compiler to **pdfLaTeX**, and set the main file to `main.tex`. Overleaf
already ships `IEEEtran.cls`.

## Current status

- Structure: complete (Abstract → Introduction → Related Work → System
  Architecture → Detection → Tracking → RTDTER → Zones → Experiments →
  Discussion → Conclusion).
- Results tables: **placeholders (`--`)** pending final training runs.
- Figures: `figures/architecture_placeholder.pdf` is referenced but not
  yet committed — add your system diagram there before final submission.
- Author block: Tanishq Modi filled in; co-author slot left blank.
