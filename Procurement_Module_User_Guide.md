# Procurement Pipeline — User Guide

**Ministry of Public Utilities and Aviation — Work OS**

This guide explains how to use the Procurement Pipeline module to track procurement packages from initial draft through to contract award. Every stage transition is recorded with full traceability for audit and compliance purposes.

---

## What Is the Procurement Pipeline?

The Procurement Pipeline is a Kanban-style tracking board where each procurement package moves through six stages from left to right:

```
Draft → Submitted → Advertised → Evaluation → No Objection → Awarded
```

Each package represents a single procurement activity (e.g., "Diesel Fuel Purchase for GPL" or "Terminal Renovation Contract for CJIA"). The system tracks how long each package has been at its current stage, flags stalled items, and maintains a permanent audit trail of every action taken.

---

## Accessing the Module

1. Log in to Work OS with your Google Workspace account.
2. Click **Procurement** in the left sidebar (Shopping Cart icon).

You will land on the **Pipeline** tab, which shows the Kanban board.

---

## Understanding the Kanban Board

### The Six Stages

| Stage | What It Means |
|-------|---------------|
| **Draft** | Package is being prepared. Not yet submitted for review. |
| **Submitted** | Package is complete and ready for the procurement process to begin. |
| **Advertised** | The tender has been publicly posted and is open for bids. |
| **Evaluation** | Bids have been received and are being assessed. |
| **No Objection** | Awaiting ministry clearance before the contract can be awarded. |
| **Awarded** | Contract has been granted. This is the final stage. |

Packages can only move **forward** — they cannot go back to a previous stage.

### Reading a Card

Each card on the board shows:

- **Title** of the procurement package
- **Agency badge** (GPL, GWI, CJIA, or GCAA)
- **Estimated value** in GYD
- **Procurement method** (Open Tender, Selective Tender, Sole Source, or RFQ)
- **Days at current stage** — color-coded:
  - **Green** = Less than 14 days (on track)
  - **Amber** = 14–29 days (approaching delay)
  - **Red** = 30+ days (stalled — needs attention)

### Filtering by Agency

Use the filter chips at the top of the board to view packages for a specific agency (GPL, GWI, CJIA, GCAA) or select **All** to see everything.

### Stats Bar

At the top of the Pipeline tab, you will see four summary numbers:

- **Active Packages** — Total packages not yet awarded
- **Pipeline Value** — Combined estimated value of all active packages
- **Avg Days to Award** — How long it typically takes from submission to award
- **Stalled** — Number of packages stuck at a stage for 30+ days

---

## Creating a New Package

> **Who can do this:** DG and Agency Admins only.

1. Click the **"+ New Package"** button in the top-right corner.
2. Fill in the form:
   - **Title** — A clear name for the procurement (e.g., "Generator Parts – Canefield Station")
   - **Description** — Details about what is being procured and why
   - **Agency** — Which agency this belongs to (DG can select any agency; Agency Admins are locked to their own)
   - **Estimated Value** — The budget for this procurement in GYD
   - **Procurement Method** — Choose one:
     - *Open Tender* — Public competitive bidding
     - *Selective Tender* — Limited to pre-qualified suppliers
     - *Sole Source* — Single supplier (for emergencies or specialized needs)
     - *Request for Quotation (RFQ)* — Quotation-based process
   - **Expected Delivery Date** (optional) — Target completion date
3. Click **Create Package**.

The package will appear in the **Draft** column.

---

## Advancing a Package to the Next Stage

> **Who can do this:** DG (any package) and Agency Admins (own agency only).

### Option 1: Drag and Drop (Desktop)

On a desktop computer, you can drag a card from one column and drop it into the **next** column to advance it. You cannot skip stages or move packages backward.

### Option 2: From the Detail Panel

1. Click on a card to open the detail panel on the right side.
2. Click the **"Advance to [Next Stage]"** button.
3. Add optional notes explaining why the package is advancing (recommended for audit purposes).
4. Confirm the advancement.

The stage change is recorded permanently in the package's history.

---

## Viewing Package Details

Click any card to open its **Detail Panel** on the right side. Here you will find:

### Stage Timeline
A visual indicator showing where the package is in the pipeline, with completed stages highlighted.

### Package Information
- Title, description, agency, estimated value
- Procurement method
- Who submitted it and when
- Expected delivery date (if set)

### Stage History
A chronological table showing every stage transition:
- What stage it moved from and to
- Who made the change
- When it happened
- Any notes provided

This history is **permanent and cannot be edited or deleted**.

### Documents
All files attached to the package (contracts, bid documents, evaluation reports, etc.).

### Notes
An audit trail of comments from team members. Notes are **permanent** — once posted, they cannot be edited or removed.

---

## Uploading Documents

> **Who can do this:** DG (any package) and Agency Admins (own agency packages).

1. Open the detail panel for a package.
2. Scroll to the **Documents** section.
3. Click **Upload** and select your file.
4. Supported file types: **PDF, DOCX, XLSX, JPEG, PNG**
5. Maximum file size: **10 MB**

Documents are stored securely and organized by agency and package.

To download a document, click its name in the documents list.

---

## Adding Notes

> **Who can do this:** All authenticated users (for packages within your agency, or all packages if you are DG/Minister/PS).

1. Open the detail panel for a package.
2. Scroll to the **Notes** section.
3. Type your note and click **Send**.

Notes are timestamped with your name and cannot be edited or deleted after posting. Use notes to record decisions, flag concerns, or provide context for stage transitions.

---

## Analytics Tab

Click the **Analytics** tab (next to Pipeline) to see charts and insights:

### Where Are Things?
A stacked bar chart showing how packages are distributed across stages, broken down by agency. Use this to quickly see if one agency has a bottleneck.

### How Long Is It Taking?
A horizontal bar chart showing the average number of days packages spend at each stage. Helps identify which part of the process is slowest.

### What Is Stuck?
A table listing all packages that have been at their current stage for 30 or more days, sorted by value. These are the items that need immediate attention.

### Pipeline Value
Summary statistics: total active packages, total pipeline value, and stalled count.

---

## What You Can Do Based on Your Role

| Action | DG | Minister | PS | Agency Admin | Officer |
|--------|:--:|:--------:|:--:|:------------:|:-------:|
| View all agencies' packages | Yes | Yes | Yes | No | No |
| View own agency's packages | Yes | Yes | Yes | Yes | Yes |
| Create new packages | Yes | No | No | Yes (own agency) | No |
| Advance packages | Yes (any) | No | No | Yes (own agency) | No |
| Upload documents | Yes (any) | No | No | Yes (own agency) | No |
| Add notes | Yes | Yes | Yes | Yes | Yes |
| Download documents | Yes | Yes | Yes | Yes | Yes |

**Agency Admins and Officers** can only see packages belonging to their agency (GPL, GWI, CJIA, or GCAA).

---

## Mobile Usage

On mobile devices, the Kanban board switches to a single-column view with a tab bar at the top to switch between stages. Drag-and-drop is not available on mobile — use the detail panel's **Advance** button instead.

---

## Key Rules

1. **Forward only.** Packages can only advance to the next stage. They cannot be moved backward or skip stages.
2. **Everything is recorded.** Every stage change, note, and document upload is logged with your name and a timestamp.
3. **Notes are permanent.** Once you post a note, it cannot be edited or deleted. Double-check before submitting.
4. **30-day stall threshold.** Any package sitting at the same stage for 30+ days will be flagged red on the board and appear in the "What is stuck?" analytics table.
5. **10 MB file limit.** Keep uploaded documents under 10 MB. Accepted formats: PDF, DOCX, XLSX, JPEG, PNG.

---

## Quick Reference

| Task | Where | Who |
|------|-------|-----|
| View the pipeline | Procurement > Pipeline tab | Everyone |
| Create a package | "+ New Package" button | DG, Agency Admin |
| Move a package forward | Drag-and-drop or Detail Panel > Advance | DG, Agency Admin |
| Attach a document | Detail Panel > Documents > Upload | DG, Agency Admin |
| Leave a note | Detail Panel > Notes | Everyone |
| Check for delays | Procurement > Analytics tab | Everyone |
| Filter by agency | Filter chips on Pipeline tab | Everyone |

---

*For technical issues or access requests, contact the system administrator.*
