# BLOCK.md: Invoicing

## Purpose
Invoicing lets businesses issue invoices, track payment status, and send reminders from one workflow.

## Entities

### Invoice
- invoiceNumber (text)
- personId (relation -> Person)
- status (enum: draft, sent, paid, overdue, void)
- issueDate (timestamp)
- dueDate (timestamp)
- subtotal (currency)
- taxAmount (currency)
- totalAmount (currency)
- notes (long text)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

### InvoiceLineItem
- invoiceId (relation -> Invoice)
- description (text)
- quantity (integer)
- unitPrice (currency)
- lineTotal (currency)

## Dependencies
- Required:
  - Person
  - Identity
- Optional:
  - Payments
  - Email

## Events
- Emits:
  - invoice.created
  - invoice.sent
  - invoice.paid
  - invoice.overdue
- Listens:
  - payment.received

## Pages

### Admin pages
1. `/invoices`
   - Invoice list with status filters and totals
   - Actions: create, send, mark paid, void
   - Empty state: prompt to create first invoice

2. `/invoices/[invoiceId]`
   - Invoice detail/editor with line items and totals
   - Actions: edit, send reminder, duplicate, download
   - Empty state: line item helper templates

### Public pages
1. `/invoices/pay/[invoiceId]`
   - Public payment page for invoice
   - Actions: pay now, download copy
   - Empty state: unavailable or already-paid messaging

### Integration pages
1. Person detail integration
   - Adds invoice summary section to person profile
   - Shows open balance and invoice timeline

Identity usage:
- Uses soul labels for people and customer-facing copy
- Uses soul voice for reminders and confirmations
- Uses soul branding on public invoice pages

## Navigation
- label: Invoices
- icon: FileText
- order: 84
