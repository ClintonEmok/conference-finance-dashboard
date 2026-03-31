import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"

// Public mutations (require authentication)

export const createAttendeeFamilyGroup = mutation({
  args: {
    label: v.optional(v.string()),
    primaryAttendeeId: v.string(),
  },
  returns: v.id("attendeeFamilyGroups"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("attendeeFamilyGroups", args)
    return id
  },
})

export const addAttendeeToFamilyGroup = mutation({
  args: {
    familyGroupId: v.id("attendeeFamilyGroups"),
    attendeeId: v.string(),
    relationship: v.optional(v.string()),
  },
  returns: v.id("attendeeFamilyMembers"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("attendeeFamilyMembers", args)
    return id
  },
})

// Public queries

export const getAttendeeFamilyGroupByPrimaryId = query({
  args: { primaryAttendeeId: v.string() },
  handler: async (ctx, args) => {
    const groups = await ctx.db
      .query("attendeeFamilyGroups")
      .withIndex("primaryAttendeeId", (q) =>
        q.eq("primaryAttendeeId", args.primaryAttendeeId)
      )
      .collect()
    return groups[0] ?? null
  },
})

export const getFamilyMembersByGroupId = query({
  args: { familyGroupId: v.id("attendeeFamilyGroups") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("attendeeFamilyMembers")
      .withIndex("familyGroupId", (q) =>
        q.eq("familyGroupId", args.familyGroupId)
      )
      .collect()
    return members
  },
})

// Internal mutations (no auth - for cron/action use)

export const internalCreateAttendeeFamilyGroup = internalMutation({
  args: {
    label: v.optional(v.string()),
    primaryAttendeeId: v.string(),
  },
  returns: v.id("attendeeFamilyGroups"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("attendeeFamilyGroups", args)
  },
})

export const internalAddAttendeeToFamilyGroup = internalMutation({
  args: {
    familyGroupId: v.id("attendeeFamilyGroups"),
    attendeeId: v.string(),
    relationship: v.optional(v.string()),
  },
  returns: v.id("attendeeFamilyMembers"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("attendeeFamilyMembers", args)
  },
})

// Internal queries (no auth - for cron/action use)

export const internalGetAttendeeFamilyGroupByPrimaryId = internalQuery({
  args: { primaryAttendeeId: v.string() },
  handler: async (ctx, args) => {
    const groups = await ctx.db
      .query("attendeeFamilyGroups")
      .withIndex("primaryAttendeeId", (q) =>
        q.eq("primaryAttendeeId", args.primaryAttendeeId)
      )
      .collect()
    return groups[0] ?? null
  },
})

export const internalGetFamilyMembersByGroupId = internalQuery({
  args: { familyGroupId: v.id("attendeeFamilyGroups") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attendeeFamilyMembers")
      .withIndex("familyGroupId", (q) =>
        q.eq("familyGroupId", args.familyGroupId)
      )
      .collect()
  },
})
