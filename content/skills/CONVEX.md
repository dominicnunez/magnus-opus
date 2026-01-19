# Convex Best Practices (2025)

## Overview

Convex is a backend-as-a-service with:
- Real-time data synchronization
- ACID transactions
- TypeScript-first development
- Automatic scaling

## Schema Design

### Defining Tables
```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table
  users: defineTable({
    // Required fields
    name: v.string(),
    email: v.string(),
    
    // Optional fields
    avatar: v.optional(v.string()),
    bio: v.optional(v.string()),
    
    // Enum-like field
    role: v.union(
      v.literal("admin"),
      v.literal("user"),
      v.literal("guest")
    ),
    
    // Nested object
    settings: v.object({
      theme: v.union(v.literal("light"), v.literal("dark")),
      notifications: v.boolean(),
    }),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_created", ["createdAt"]),

  // Posts table with foreign key
  posts: defineTable({
    authorId: v.id("users"), // Reference to users table
    title: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    published: v.boolean(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_author", ["authorId"])
    .index("by_published", ["published", "publishedAt"])
    .index("by_tag", ["tags"]),

  // Comments with nested reference
  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"]),
});
```

### Validator Patterns
```typescript
import { v } from "convex/values";

// Reusable validators
const emailValidator = v.string(); // Could add regex validation in handler

const paginationArgs = {
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

const timestampFields = {
  createdAt: v.number(),
  updatedAt: v.number(),
};
```

## Queries

### Basic Query
```typescript
// convex/users.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").collect();
  },
});
```

### Query with Filtering
```typescript
export const listByRole = query({
  args: {
    role: v.union(v.literal("admin"), v.literal("user"), v.literal("guest")),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
  },
});
```

### Query with Pagination
```typescript
export const listPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const results = await ctx.db
      .query("users")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    
    return {
      items: results.page,
      nextCursor: results.continueCursor,
      hasMore: !results.isDone,
    };
  },
});
```

### Query with Joins (Manual)
```typescript
export const getWithPosts = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.id))
      .collect();
    
    return { ...user, posts };
  },
});
```

## Mutations

### Create Mutation
```typescript
// convex/users.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate uniqueness
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    
    if (existing) {
      throw new Error("Email already registered");
    }
    
    const now = Date.now();
    
    return ctx.db.insert("users", {
      ...args,
      role: "user",
      settings: {
        theme: "light",
        notifications: true,
      },
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

### Update Mutation
```typescript
export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    settings: v.optional(v.object({
      theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
      notifications: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    const user = await ctx.db.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    
    // Build update object, handling nested settings
    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    
    if (updates.bio !== undefined) {
      updateData.bio = updates.bio;
    }
    
    if (updates.settings) {
      updateData.settings = {
        ...user.settings,
        ...updates.settings,
      };
    }
    
    await ctx.db.patch(id, updateData);
  },
});
```

### Delete Mutation
```typescript
export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) {
      throw new Error("User not found");
    }
    
    // Delete related data first (cascade)
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.id))
      .collect();
    
    for (const post of posts) {
      // Delete comments on each post
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect();
      
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }
      
      await ctx.db.delete(post._id);
    }
    
    // Finally delete user
    await ctx.db.delete(args.id);
  },
});
```

## Actions

Actions are for non-deterministic operations (HTTP calls, random numbers, etc.)

```typescript
// convex/emails.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const sendWelcome = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Actions can call queries
    const user = await ctx.runQuery(api.users.getById, { id: args.userId });
    if (!user) {
      throw new Error("User not found");
    }
    
    // Call external API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@example.com",
        to: user.email,
        subject: "Welcome!",
        html: `<h1>Welcome, ${user.name}!</h1>`,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
    
    // Actions can call mutations
    await ctx.runMutation(api.users.update, {
      id: args.userId,
      // Track email sent
    });
    
    return { sent: true };
  },
});
```

## Internal Functions

For server-to-server calls only:

```typescript
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Cannot be called from client
export const _incrementLoginCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;
    
    await ctx.db.patch(args.userId, {
      loginCount: (user.loginCount ?? 0) + 1,
      lastLoginAt: Date.now(),
    });
  },
});
```

## Scheduled Functions (Crons)

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run every hour
crons.interval(
  "cleanup-expired-sessions",
  { hours: 1 },
  internal.sessions._cleanupExpired
);

// Run daily at midnight UTC
crons.daily(
  "send-daily-digest",
  { hourUTC: 0, minuteUTC: 0 },
  internal.emails._sendDailyDigest
);

export default crons;
```

## Error Handling

```typescript
// Custom error types
export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Usage in mutations
export const update = mutation({
  args: { id: v.id("users"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) {
      throw new NotFoundError("User", args.id);
    }
    
    if (args.name.length < 2) {
      throw new ValidationError("Name must be at least 2 characters");
    }
    
    await ctx.db.patch(args.id, { name: args.name });
  },
});
```

## File Storage

```typescript
// convex/files.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

export const saveFile = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("files", {
      storageId: args.storageId,
      fileName: args.fileName,
      uploadedBy: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return ctx.storage.getUrl(args.storageId);
  },
});
```

## Best Practices Summary

1. **Use indexes for all queries** - Never use .filter() on large datasets
2. **Validate in handlers** - Use Convex validators + custom validation
3. **Handle errors explicitly** - Throw descriptive errors
4. **Keep mutations focused** - One responsibility per function
5. **Use actions for external calls** - Never call external APIs from mutations
6. **Timestamp everything** - createdAt/updatedAt for audit trails
7. **Cascade deletes manually** - Convex doesn't have automatic cascading
8. **Use internal functions** - For server-side only operations
