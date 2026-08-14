import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"

/**
 * Event-scoped saved announcement templates for the Communications Center.
 *
 * Every function is operator-gated through `requireIdentity` and scoped to a
 * single event. Templates snapshot the AnnouncementEmail compose fields
 * (title, message, event name/date/location, optional payment URL and
 * night-before note) so an operator can reuse a written announcement within
 * the same event. This is announcement-only by design.
 */

export const getTemplatesForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const templates = await ctx.db
      .query("emailTemplates")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(100)
    // Newest-first by most recent edit, newest creation first on ties.
    return [...templates].sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

/**
 * Upsert an announcement template. When no `templateId` is supplied a new
 * row is inserted; when one is supplied the existing template is patched in
 * place (never duplicated) after verifying it belongs to the same event.
 * Requires a non-empty name, title, and message.
 */
export const saveTemplate = mutation({
  args: {
    eventId: v.id("events"),
    templateId: v.optional(v.id("emailTemplates")),
    name: v.string(),
    title: v.string(),
    message: v.string(),
    eventName: v.string(),
    eventDate: v.string(),
    eventLocation: v.string(),
    paymentUrl: v.optional(v.string()),
    nightBeforeNote: v.optional(v.string()),
  },
  returns: v.id("emailTemplates"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const name = args.name.trim()
    const title = args.title.trim()
    const message = args.message.trim()
    if (!name || !title || !message) {
      throw new Error("Template name, title, and message are required")
    }

    const now = Date.now()
    if (args.templateId) {
      const existing = await ctx.db.get("emailTemplates", args.templateId)
      if (!existing) {
        throw new Error("Template not found")
      }
      if (String(existing.eventId) !== String(args.eventId)) {
        throw new Error("Template belongs to another event")
      }
      await ctx.db.patch("emailTemplates", args.templateId, {
        name,
        title,
        message,
        eventName: args.eventName,
        eventDate: args.eventDate,
        eventLocation: args.eventLocation,
        paymentUrl: args.paymentUrl,
        nightBeforeNote: args.nightBeforeNote,
        updatedAt: now,
      })
      return args.templateId
    }

    return await ctx.db.insert("emailTemplates", {
      eventId: args.eventId,
      name,
      title,
      message,
      eventName: args.eventName,
      eventDate: args.eventDate,
      eventLocation: args.eventLocation,
      paymentUrl: args.paymentUrl,
      nightBeforeNote: args.nightBeforeNote,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Delete a single announcement template after verifying it belongs to the
 * supplied event. Only the requested template is removed.
 */
export const deleteTemplate = mutation({
  args: {
    eventId: v.id("events"),
    templateId: v.id("emailTemplates"),
  },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const template = await ctx.db.get("emailTemplates", args.templateId)
    if (!template) {
      throw new Error("Template not found")
    }
    if (String(template.eventId) !== String(args.eventId)) {
      throw new Error("Template belongs to another event")
    }
    await ctx.db.delete(args.templateId)
    return { deleted: true }
  },
})
