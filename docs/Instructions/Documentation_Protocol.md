---
type: standard
status: active
impact: critical
tags: [meta, rules, workflow]
---

# Documentation Protocol

## The Prime Directive
**"The Map is the Territory."**
Code is merely the execution of the logic defined here. You must update the documentation **BEFORE** writing any code.

## Workflow: The "Map-First" Approach
1.  **Locate**: Find the component in the System Map that corresponds to the code you want to change.
2.  **Define**: Update the Markdown file with the new logic, field, or responsibility.
    *   *If it's a new feature*: Create a new file in the appropriate folder and link it to a Parent.
3.  **Implement**: Write the code to match the new definition.
4.  **Verify**: Ensure the code does exactly what the Map says, and nothing more.

## Organization Rules (The Librarian's Code)
1.  **No Orphans**: Every file must list a **Parent** in its Hierarchy section.
2.  **Functional Naming**: Filenames must describe **Process** (e.g., `calculate_tax.md`), not implementation details.
3.  **Standard Frontmatter**: Every file must start with the standard YAML block (`type`, `status`, `impact`, `tags`).
4.  **Black Box Principle**: Describe inputs (trigger), outputs (result), and side effects. Avoid pasting large blocks of code; describe the *logic*.
5.  **Wiki-Links**: Use `[[Wiki-Links]]` for all references to other system parts.

## Folder Hierarchy Standards
*   `00_Library`: Top-level System definitions and Meta protocols.
*   `01_Subsystems`: Major functional domains (Inventory, Finance).
*   `02_Assemblies`: Logical groups of features (Ledgers, Controllers).
*   `03_Components`: Concrete data entities (Tables, Models).
*   `04_Parts`: Small, specific algorithms or logic blocks.
