# Spark Ring — Backer Data Validation Report

**Campaign:** THE FIRST 853  
**Mode:** PROTOTYPE  
**Source:** `backer名单.xlsx`  
**Generated (UTC):** 2026-10-30T03:34:16+00:00  
**Overall status:** **PASS WITH NOTES**

> Privacy: this report deliberately contains **no original usernames**. 
> Public labels are either an authorized `approved_display_name` or a 
> deterministic privacy mask. Backer Numbers are preserved as identifiers.

## Issues requiring attention

- Campaign title claims 853 backers; the supplied workbook contains 816 unique Backer Numbers (-37).
- No approved_display_name column was supplied. Public labels were derived with the MASK-1 privacy policy; original usernames were not published.

## 1. Executive summary

| Check | Result |
| --- | --- |
| Source rows including header | 817 |
| Valid supporter records | 816 |
| Unique Backer Numbers | 816 |
| Duplicate Backer Numbers | 0 |
| Blank Backer Numbers | 0 |
| Blank names | 0 |
| Campaign title count | 853 |
| Difference vs campaign title | **-37** |
| Records selected for prototype | 50 |
| Distinct Backer Numbers in prototype | 50 |
| Distinct display labels in prototype | 49 |

## 2. The 816 vs 853 discrepancy

The workbook contains **816 unique Backer Numbers**, not 853. The campaign headline remains “853 BELIEVERS. ONE SPARK.” as supplied, but the artwork footer states the verifiable record count. No names or numbers were invented to close the 37-record gap.

**Decision needed before the final render:** either supply the missing authorized records, or approve a final count treatment that distinguishes the campaign title (853) from the authorized dataset (816).

## 3. Identifier integrity

| Check | Result |
| --- | --- |
| Backer Number blanks | 0 |
| Duplicate number values | 0 |
| Numbers mapped to more than one name | 0 |
| Numeric span | #2–#950 |
| Gaps inside numeric span | 133 (see appendix) |
| Prototype mapping errors | 0 |

Numbers were read from the source and sorted only to choose the prototype sample. They were never generated, reassigned, or inferred from spreadsheet row order.

## 4. Duplicate public names

25 case-insensitive name groups cover 29 extra rows. These are kept as separate supporters because their Backer Numbers differ. No record was deduplicated by name.

| Masked public label | Backer Numbers | Rows |
| --- | --- | ---: |
| Alan*** | #352, #890 | 2 |
| Alex*** | #146, #389 | 2 |
| Alina*** | #168, #907 | 2 |
| Allen*** | #224, #625 | 2 |
| BEN*** | #235, #410 | 2 |
| Brian*** | #710, #811 | 2 |
| carlo*** | #505, #672 | 2 |
| clair*** | #62, #233 | 2 |
| Crist*** | #52, #183 | 2 |
| Danie*** | #238, #292, #371, #944 | 4 |
| Dean*** | #145, #676 | 2 |
| Georg*** | #45, #106 | 2 |
| James*** | #327, #390, #751 | 3 |
| Jess*** | #50, #476 | 2 |
| Joe*** | #575, #603 | 2 |
| John*** | #357, #713 | 2 |
| Kisha*** | #552, #652 | 2 |
| Larry*** | #405, #926 | 2 |
| Matt*** | #316, #618 | 2 |
| Megan*** | #177, #808, #833 | 3 |
| Pavel*** | #170, #917 | 2 |
| Russe*** | #897, #914 | 2 |
| Sam*** | #71, #668 | 2 |
| tom*** | #311, #739 | 2 |
| Troy*** | #37, #585 | 2 |

## 5. Display-label policy

The workbook has **Backer Number** and **Backer Name** only; it does not contain an `approved_display_name` column. Public labels were therefore derived using **MASK-1**: keep up to five graphemes of the first token (one grapheme for CJK-led names), then append `***`.

This is a privacy transformation, not a new username. The original spelling is preserved in memory for mapping checks but is never written to the public dataset, index, SVG, poster, or preview.

Mask collisions in the prototype: `andre***` ×2. The Backer Number is the primary identifier precisely so these records remain unambiguous.

## 6. Prototype sample

- Rule: Lowest 50 numeric Backer Numbers, independently of row order.
- Range: #2–#63 (50 records).
- Unique Backer Numbers: 50.
- Unique display labels: 49.
- Each selected record is assigned exactly one star.

| Backer | Public label | Star ID |
| ---: | --- | --- |
| #2 | Amir*** | `SR-2` |
| #5 | Dawn*** | `SR-5` |
| #6 | Andre*** | `SR-6` |
| #7 | Evolv*** | `SR-7` |
| #8 | Eric*** | `SR-8` |
| #9 | Harry*** | `SR-9` |
| #13 | Natha*** | `SR-13` |
| #15 | Mahmo*** | `SR-15` |
| #17 | slipb*** | `SR-17` |
| #18 | PPL*** | `SR-18` |
| #19 | Stewa*** | `SR-19` |
| #20 | Grazi*** | `SR-20` |
| #21 | Micha*** | `SR-21` |
| #22 | Nelso*** | `SR-22` |
| #23 | Heath*** | `SR-23` |
| #24 | Jack*** | `SR-24` |
| #25 | Arno*** | `SR-25` |
| #26 | Louis*** | `SR-26` |
| #27 | Bryan*** | `SR-27` |
| #28 | Silvi*** | `SR-28` |
| #29 | Brian*** | `SR-29` |
| #30 | Linda*** | `SR-30` |
| #32 | David*** | `SR-32` |
| #33 | Olive*** | `SR-33` |
| #34 | ors*** | `SR-34` |
| #35 | Dale*** | `SR-35` |
| #36 | artur*** | `SR-36` |
| #37 | Troy*** | `SR-37` |
| #38 | Tony*** | `SR-38` |
| #39 | Circu*** | `SR-39` |
| #41 | Jil*** | `SR-41` |
| #42 | Aadev*** | `SR-42` |
| #44 | Colli*** | `SR-44` |
| #45 | Georg*** | `SR-45` |
| #47 | VRG*** | `SR-47` |
| #49 | Gorda*** | `SR-49` |
| #50 | Jess*** | `SR-50` |
| #51 | Carin*** | `SR-51` |
| #52 | Crist*** | `SR-52` |
| #53 | Adam*** | `SR-53` |
| #54 | Don*** | `SR-54` |
| #55 | Paolo*** | `SR-55` |
| #56 | Andre*** | `SR-56` |
| #57 | Mina*** | `SR-57` |
| #58 | Progr*** | `SR-58` |
| #59 | Toby*** | `SR-59` |
| #60 | ALO*** | `SR-60` |
| #61 | Gunth*** | `SR-61` |
| #62 | clair*** | `SR-62` |
| #63 | Peter*** | `SR-63` |

## 7. Reproducibility and privacy

- Source SHA-256: `02453aac60ec0c72fd2b5687537e909ea56bd723b77219e632e9262537a314b3`
- Pipeline version: `1.0.0`
- Star positions use SHA-256-derived deterministic jitter; no ambient randomness.
- All names in SVG artwork are real `<text>` elements, never rasterized lettering.
- No original usernames appear in public JSON, CSV, SVG, PNG, HTML, or this report.

## Appendix A — numeric gaps inside the source span

These numbers are absent from the workbook. They are **not** assumed to be supporters and are **not** filled. They may reflect cancelled pledges, unissued numbers, or a partial export.

`3, 4, 10, 11, 12, 14, 16, 31, 40, 43, 46, 48, 74, 78, 84, 95, 100, 102, 125, 144, 161, 162, 171, 172, 173, 174, 180, 181, 182, 191, 198, 218, 222, 239, 241, 263, 267, 269, 276, 282, 286, 291, 294, 324, 332, 334, 336, 341, 359, 362, 367, 385, 394, 403, 406, 408, 413, 419, 437, 449, 466, 468, 480, 482, 484, 486, 489, 500, 503, 504, 509, 510, 517, 522, 526, 538, 546, 547, 566, 572, 579, 588, 593, 601, 623, 629, 633, 634, 645, 646, 650, 655, 657, 662, 663, 670, 677, 679, 683, 686, 687, 689, 695, 704, 705, 714, 717, 718, 720, 723, 725, 730, 732, 736, 760, 761, 764, 766, 769, 770, 772, 779, 782, 787, 794, 796, 799, 800, 816, 828, 839, 843, 901`

