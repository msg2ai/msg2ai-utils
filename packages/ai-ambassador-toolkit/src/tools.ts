/**
 * The tool catalog.
 *
 * The gateway publishes the authoritative catalog at GET /capabilities, and a
 * test there guarantees every tool it lists is mounted at the path and scope
 * it advertises. This file is
 * the client-side copy of that list, and `catalogMatches()` below is how a
 * skin checks it has not drifted from the server it is talking to.
 *
 * Drift is expected, not exceptional: a customer installs a version of this
 * package and keeps it while the gateway moves on. So the client asks
 * `/capabilities` at startup and reports the difference rather than assuming.
 */

/**
 * Every scope a key can hold, mirroring the gateway's `AGENT_SCOPES`.
 *
 * Two of these gate no tool in TOOLS, which is not an oversight:
 * `instructions:write` gates FIELDS on create/update_assistant
 * (customInstruction, guardrailsConfig, privacySettings, reservations) rather
 * than a route of its own, and `templates:submit` has no handler mounted yet.
 */
export type AgentScope =
  | 'assistants:read'
  | 'assistants:write'
  | 'instructions:write'
  | 'numbers:attach'
  | 'templates:read'
  | 'templates:write'
  | 'templates:submit'
  | 'knowledge:write'
  | 'audiences:read'
  | 'audiences:write'
  | 'conversations:read'
  | 'conversations:write'
  | 'broadcasts:send'
  | 'broadcasts:write'
  | 'surveys:read'
  | 'surveys:write'
  | 'results:read'
  | 'results:export'
  | 'meetings:read'
  | 'meetings:write'
  | 'checkin:read'
  | 'checkin:write'
  | 'reminders:read'
  | 'reminders:write'
  | 'integrations:read'
  | 'integrations:write'
  | 'usage:read';

export interface AgentTool {
  name: string;
  method: 'get' | 'post' | 'put' | 'delete';
  /** Path on /api/agent. `:name` segments are filled from the call's input. */
  path: string;
  scope: AgentScope | null;
  summary: string;
  /** JSON Schema for the tool's input, used by the MCP skin. */
  input: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const NO_INPUT = { type: 'object' as const, properties: {} };

export const TOOLS: AgentTool[] = [
  {
    name: 'capabilities',
    method: 'get',
    path: '/capabilities',
    scope: null,
    summary: 'The tools this key may call, and the scopes it holds.',
    input: NO_INPUT
  },
  {
    name: 'list_assistants',
    method: 'get',
    path: '/assistants',
    scope: 'assistants:read',
    summary: "List the organization's assistants.",
    input: NO_INPUT
  },
  {
    name: 'get_assistant',
    method: 'get',
    path: '/assistants/:serviceId',
    scope: 'assistants:read',
    summary: 'One assistant, by serviceId.',
    input: {
      type: 'object',
      properties: { serviceId: { type: 'string' } },
      required: ['serviceId']
    }
  },
  {
    name: 'create_assistant',
    method: 'post',
    path: '/assistants',
    scope: 'assistants:write',
    summary:
      'Create an assistant. No phone number is attached — that is an operator step.',
    input: {
      type: 'object',
      properties: {
        assistantName: { type: 'string' },
        assistantData: {
          type: 'object',
          description:
            'Presentation and configuration only. Instructions, guardrails, privacy settings and provider credentials are refused.'
        },
        audienceType: { type: 'string' }
      },
      required: ['assistantName', 'assistantData']
    }
  },
  {
    name: 'update_assistant',
    method: 'put',
    path: '/assistants/:serviceId',
    scope: 'assistants:write',
    summary:
      'Update an assistant. Instructions, guardrails and privacy settings are not editable here.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        assistantName: { type: 'string' },
        assistantData: { type: 'object' }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'list_templates',
    method: 'get',
    path: '/content-templates',
    scope: 'templates:read',
    summary: "List an assistant's content templates.",
    input: {
      type: 'object',
      properties: { serviceId: { type: 'string' } }
    }
  },
  {
    name: 'save_templates',
    method: 'post',
    path: '/content-templates/batch-save',
    scope: 'templates:write',
    summary:
      'Create or update content templates in one write. Does NOT submit them for approval.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        templates: { type: 'array', items: { type: 'object' } }
      },
      required: ['serviceId', 'templates']
    }
  },
  {
    name: 'upload_knowledge',
    method: 'post',
    path: '/knowledge',
    scope: 'knowledge:write',
    summary: 'Add a text knowledge document to an assistant.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        text: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['serviceId', 'text']
    }
  },
  {
    name: 'upload_knowledge_website',
    method: 'post',
    path: '/knowledge/website',
    scope: 'knowledge:write',
    summary:
      'Add a web page or a bounded crawl as a knowledge document. The crawl budget is clamped server-side.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        url: { type: 'string' },
        mode: { type: 'string', enum: ['single', 'crawl'] },
        limit: { type: 'number' },
        maxDepth: { type: 'number' },
        name: { type: 'string' }
      },
      required: ['serviceId', 'url']
    }
  },
  {
    name: 'delete_knowledge',
    method: 'delete',
    path: '/knowledge/:documentUuid',
    scope: 'knowledge:write',
    summary: 'Remove a knowledge document.',
    input: {
      type: 'object',
      properties: { documentUuid: { type: 'string' } },
      required: ['documentUuid']
    }
  },
  {
    name: 'list_broadcasts',
    method: 'get',
    path: '/broadcasts',
    scope: 'broadcasts:send',
    summary: "List the organization's broadcast campaigns.",
    input: NO_INPUT
  },
  {
    name: 'get_broadcast',
    method: 'get',
    path: '/broadcasts/:campaignId',
    scope: 'broadcasts:send',
    summary: 'One broadcast campaign, with its delivery counts.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'send_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/send',
    scope: 'broadcasts:send',
    summary:
      'Send a broadcast now. SPENDS MONEY. Recipients are counted and charged against the key’s daily budget before anything is queued; a send over the per-call ceiling or the daily budget is refused outright.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'pause_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/pause',
    scope: 'broadcasts:send',
    summary: 'Halt a sending broadcast. Queued recipients stop.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'cancel_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/cancel',
    scope: 'broadcasts:send',
    summary: 'Cancel a broadcast.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'get_usage',
    method: 'get',
    path: '/usage',
    scope: 'usage:read',
    summary: 'Message counts for the organization.',
    input: NO_INPUT
  },
  {
    name: 'list_conversations',
    method: 'get',
    path: '/conversations',
    scope: 'conversations:read',
    summary:
      'List guest conversations. Numbers are masked and no message text is returned — open one to read it.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      }
    }
  },
  {
    name: 'get_conversation',
    method: 'get',
    path: '/conversations/:conversationId',
    scope: 'conversations:read',
    summary:
      'One conversation with its last 100 messages, oldest first. Provider ids and staff ids are not included.',
    input: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string'
        }
      },
      required: ['conversationId']
    }
  },
  {
    name: 'list_audience_groups',
    method: 'get',
    path: '/audience-groups',
    scope: 'audiences:read',
    summary:
      'List audience groups across the organization, with member counts rather than membership.',
    input: NO_INPUT
  },
  {
    name: 'list_contacts',
    method: 'get',
    path: '/contacts',
    scope: 'audiences:read',
    summary:
      'Search contacts by name. Numbers are masked; email, notes and enrichment are never returned.',
    input: {
      type: 'object',
      properties: {
        q: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        }
      }
    }
  },
  {
    name: 'list_surveys',
    method: 'get',
    path: '/surveys',
    scope: 'surveys:read',
    summary:
      "List the organization's surveys.",
    input: NO_INPUT
  },
  {
    name: 'get_survey_results',
    method: 'get',
    path: '/surveys/:surveyId/results',
    scope: 'results:read',
    summary:
      'Aggregate survey results. Answers are grouped by question with no respondent attached.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        }
      },
      required: ['surveyId']
    }
  },
  {
    name: 'create_contact',
    method: 'post',
    path: '/contacts',
    scope: 'audiences:write',
    summary:
      'Add a contact to an assistant. The organization is taken from the key, never the body.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        number: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        displayName: {
          type: 'string'
        },
        firstName: {
          type: 'string'
        },
        lastName: {
          type: 'string'
        },
        category: {
          type: 'string'
        },
        type: {
          type: 'string'
        },
        startDate: {
          type: 'string'
        },
        endDate: {
          type: 'string'
        }
      },
      required: ['serviceId', 'number']
    }
  },
  {
    name: 'update_contact',
    method: 'put',
    path: '/contacts/:audienceId',
    scope: 'audiences:write',
    summary:
      'Change a contact’s name or category. The number, assistant and tenant cannot be changed.',
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        displayName: {
          type: 'string'
        },
        firstName: {
          type: 'string'
        },
        lastName: {
          type: 'string'
        },
        category: {
          type: 'string'
        },
        type: {
          type: 'string'
        },
        startDate: {
          type: 'string'
        },
        endDate: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'delete_contact',
    method: 'delete',
    path: '/contacts/:audienceId',
    scope: 'audiences:write',
    summary:
      'Remove a contact.',
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'add_contact_tags',
    method: 'post',
    path: '/contacts/:audienceId/tags',
    scope: 'audiences:write',
    summary:
      'Add tags to a contact.',
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      required: ['audienceId', 'tags']
    }
  },
  {
    name: 'remove_contact_tag',
    method: 'delete',
    path: '/contacts/:audienceId/tags/:tagId',
    scope: 'audiences:write',
    summary:
      'Remove one tag from a contact.',
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        },
        tagId: {
          type: 'string'
        }
      },
      required: ['audienceId', 'tagId']
    }
  },
  {
    name: 'create_audience_group',
    method: 'post',
    path: '/audience-groups',
    scope: 'audiences:write',
    summary:
      'Create an audience group on one of the organization’s assistants.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        audienceGroup: {
          type: 'object',
          properties: {
            name: {
              type: 'string'
            },
            description: {
              type: 'string'
            }
          },
          required: ['name']
        }
      },
      required: ['serviceId', 'audienceGroup']
    }
  },
  {
    name: 'update_audience_group',
    method: 'put',
    path: '/audience-groups/:groupId',
    scope: 'audiences:write',
    summary:
      'Rename or re-describe an audience group.',
    input: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        audienceGroup: {
          type: 'object'
        }
      },
      required: ['groupId', 'audienceGroup']
    }
  },
  {
    name: 'add_audience_group_members',
    method: 'post',
    path: '/audience-groups/:groupId/members',
    scope: 'audiences:write',
    summary:
      'Add existing contacts to an audience group.',
    input: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string'
        },
        audienceIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        serviceId: {
          type: 'string'
        }
      },
      required: ['groupId', 'audienceIds']
    }
  },
  {
    name: 'delete_audience_group',
    method: 'delete',
    path: '/audience-groups/:groupId',
    scope: 'audiences:write',
    summary:
      'Delete an audience group. The contacts in it are not deleted.',
    input: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string'
        }
      },
      required: ['groupId']
    }
  },
  {
    name: 'create_broadcast',
    method: 'post',
    path: '/broadcasts',
    scope: 'broadcasts:write',
    summary:
      'Draft a broadcast campaign. Created as DRAFT and never sent — sending is a separate tool and a separate scope.',
    input: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        channel: {
          type: 'string'
        },
        textType: {
          type: 'string'
        },
        content: {
          type: 'string'
        },
        templateSid: {
          type: 'string'
        },
        templateVariableMappings: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        messageLanguage: {
          type: 'string'
        },
        audienceGroupIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        estimatedRecipients: {
          type: 'number'
        },
        schedule: {
          type: 'object'
        },
        recurrence: {
          type: 'object'
        }
      },
      required: ['customerId', 'serviceId', 'name', 'channel', 'textType', 'messageLanguage', 'audienceGroupIds', 'schedule']
    }
  },
  {
    name: 'update_broadcast',
    method: 'put',
    path: '/broadcasts/:campaignId',
    scope: 'broadcasts:write',
    summary:
      'Update a draft broadcast campaign. Does not send it.',
    input: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        channel: {
          type: 'string'
        },
        textType: {
          type: 'string'
        },
        content: {
          type: 'string'
        },
        templateSid: {
          type: 'string'
        },
        templateVariableMappings: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        messageLanguage: {
          type: 'string'
        },
        audienceGroupIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        estimatedRecipients: {
          type: 'number'
        },
        schedule: {
          type: 'object'
        },
        recurrence: {
          type: 'object'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'delete_broadcast',
    method: 'delete',
    path: '/broadcasts/:campaignId',
    scope: 'broadcasts:write',
    summary:
      'Delete a broadcast campaign.',
    input: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string'
        }
      },
      required: ['campaignId']
    }
  },
  {
    name: 'get_checkin_stats',
    method: 'get',
    path: '/checkin/stats/:serviceId',
    scope: 'checkin:read',
    summary:
      'Check-in totals for one assistant: how many attendees, how many arrived, and by which method. Counts only, no attendee rows.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'get_attendee_checkin',
    method: 'get',
    path: '/checkin/attendees/:audienceId',
    scope: 'checkin:read',
    summary:
      "One attendee's check-in code and arrival state, by audience id. There is deliberately no bulk listing of codes.",
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'list_checkin_arrivals',
    method: 'get',
    path: '/checkin/arrivals/:serviceId',
    scope: 'checkin:read',
    summary:
      'Attendees who have checked in, most recent first. Codes are NOT included; use get_attendee_checkin for one.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'generate_checkin_codes',
    method: 'post',
    path: '/checkin/codes',
    scope: 'checkin:write',
    summary:
      "Mint check-in codes for an assistant's attendees. Returns how many were generated, never the codes.",
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        audienceIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'regenerate_attendee_checkin_code',
    method: 'post',
    path: '/checkin/attendees/:audienceId/regenerate',
    scope: 'checkin:write',
    summary:
      "Replace one attendee's check-in code, invalidating the old one. Returns the new code, for that attendee only.",
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'list_event_registration_connections',
    method: 'get',
    path: '/integrations/event-registration/connections',
    scope: 'integrations:read',
    summary:
      'List the Humanitix event connections, with their last-7-day sync counts.',
    input: NO_INPUT
  },
  {
    name: 'create_event_registration_connection',
    method: 'post',
    path: '/integrations/event-registration/connections',
    scope: 'integrations:write',
    summary:
      'Connect a Humanitix event to one of the organization’s assistants.',
    input: {
      type: 'object',
      properties: {
        externalEventId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        provider: {
          type: 'string'
        },
        externalEventName: {
          type: 'string'
        },
        audienceGroupId: {
          type: 'string'
        },
        defaultCategory: {
          type: 'string'
        },
        categoryRules: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        autoGenerateCheckInCode: {
          type: 'boolean'
        },
        defaultCountryCode: {
          type: 'string'
        },
        defaultLanguage: {
          type: 'string'
        },
        status: {
          type: 'string'
        }
      },
      required: ['externalEventId', 'serviceId']
    }
  },
  {
    name: 'update_event_registration_connection',
    method: 'put',
    path: '/integrations/event-registration/connections/:connectionId',
    scope: 'integrations:write',
    summary:
      'Change a connection’s category rules, audience group, or active status.',
    input: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string'
        },
        externalEventId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        provider: {
          type: 'string'
        },
        externalEventName: {
          type: 'string'
        },
        audienceGroupId: {
          type: 'string'
        },
        defaultCategory: {
          type: 'string'
        },
        categoryRules: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        autoGenerateCheckInCode: {
          type: 'boolean'
        },
        defaultCountryCode: {
          type: 'string'
        },
        defaultLanguage: {
          type: 'string'
        },
        status: {
          type: 'string'
        }
      },
      required: ['connectionId']
    }
  },
  {
    name: 'delete_event_registration_connection',
    method: 'delete',
    path: '/integrations/event-registration/connections/:connectionId',
    scope: 'integrations:write',
    summary:
      'Remove a connection. Registrations already imported are not deleted.',
    input: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string'
        }
      },
      required: ['connectionId']
    }
  },
  {
    name: 'list_event_registration_sync_events',
    method: 'get',
    path: '/integrations/event-registration/sync-events',
    scope: 'integrations:read',
    summary:
      'Recent registration sync attempts and why they failed. The raw provider payload is not returned.',
    input: NO_INPUT
  },
  {
    name: 'list_meetings',
    method: 'get',
    path: '/meetings',
    scope: 'meetings:read',
    summary:
      'List meeting requests. Numbers are masked and email, company, title and free-text notes are not returned.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        status: {
          type: 'string'
        }
      }
    }
  },
  {
    name: 'get_meeting',
    method: 'get',
    path: '/meetings/:requestId',
    scope: 'meetings:read',
    summary:
      'One meeting request, by requestId.',
    input: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string'
        }
      },
      required: ['requestId']
    }
  },
  {
    name: 'create_meeting',
    method: 'post',
    path: '/meetings',
    scope: 'meetings:write',
    summary:
      'Create a meeting request. The organization is taken from the key, never the body.',
    input: {
      type: 'object',
      properties: {
        requesterName: {
          type: 'string'
        },
        requesterPhone: {
          type: 'string'
        },
        recipientName: {
          type: 'string'
        },
        recipientPhone: {
          type: 'string'
        },
        subject: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        requesterEmail: {
          type: 'string'
        },
        requesterCompany: {
          type: 'string'
        },
        requesterTitle: {
          type: 'string'
        },
        recipientEmail: {
          type: 'string'
        },
        recipientCompany: {
          type: 'string'
        },
        recipientTitle: {
          type: 'string'
        },
        preferredDate: {
          type: 'string'
        },
        alternativeDate: {
          type: 'string'
        },
        message: {
          type: 'string'
        },
        location: {
          type: 'string'
        },
        duration: {
          type: 'number'
        },
        slotId: {
          type: 'string'
        }
      },
      required: ['requesterName', 'requesterPhone', 'recipientName', 'recipientPhone', 'subject']
    }
  },
  {
    name: 'update_meeting',
    method: 'put',
    path: '/meetings/:requestId',
    scope: 'meetings:write',
    summary:
      'Update a meeting request, including its status.',
    input: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string'
        },
        requesterName: {
          type: 'string'
        },
        requesterPhone: {
          type: 'string'
        },
        recipientName: {
          type: 'string'
        },
        recipientPhone: {
          type: 'string'
        },
        subject: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        requesterEmail: {
          type: 'string'
        },
        requesterCompany: {
          type: 'string'
        },
        requesterTitle: {
          type: 'string'
        },
        recipientEmail: {
          type: 'string'
        },
        recipientCompany: {
          type: 'string'
        },
        recipientTitle: {
          type: 'string'
        },
        preferredDate: {
          type: 'string'
        },
        alternativeDate: {
          type: 'string'
        },
        message: {
          type: 'string'
        },
        location: {
          type: 'string'
        },
        duration: {
          type: 'number'
        },
        slotId: {
          type: 'string'
        },
        status: {
          type: 'string'
        }
      },
      required: ['requestId']
    }
  },
  {
    name: 'delete_meeting',
    method: 'delete',
    path: '/meetings/:requestId',
    scope: 'meetings:write',
    summary:
      'Delete a meeting request.',
    input: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string'
        }
      },
      required: ['requestId']
    }
  },
  {
    name: 'list_meeting_slots',
    method: 'get',
    path: '/meeting-slots/:serviceId',
    scope: 'meetings:read',
    summary:
      "List an assistant's bookable meeting slots, with their availability.",
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'reply_to_conversation',
    method: 'post',
    path: '/conversations/:conversationId/reply',
    scope: 'conversations:write',
    summary:
      'Send a message into an existing guest conversation. The recipient is taken from the conversation, never from the caller, and the send is charged against the daily budget.',
    input: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string'
        },
        message: {
          type: 'string'
        }
      },
      required: ['conversationId', 'message']
    }
  },
  {
    name: 'list_numbers',
    method: 'get',
    path: '/numbers',
    scope: 'numbers:attach',
    summary:
      'The numbers this organization already owns, and which assistant each is on.',
    input: NO_INPUT
  },
  {
    name: 'attach_number',
    method: 'post',
    path: '/assistants/:serviceId/number',
    scope: 'numbers:attach',
    summary:
      'Bind a number the organization already owns to one of its assistants. Cannot claim unassigned pool inventory — that stays an operator step.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        telephoneNumber: {
          type: 'string'
        }
      },
      required: ['serviceId', 'telephoneNumber']
    }
  },
  {
    name: 'detach_number',
    method: 'delete',
    path: '/assistants/:serviceId/number',
    scope: 'numbers:attach',
    summary:
      "Take the number off an assistant. It returns to the organization's own numbers, not to the shared pool.",
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'list_contact_preferences',
    method: 'get',
    path: '/preferences',
    scope: 'audiences:read',
    summary:
      'Contact consent flags across the organization. Filter with ?serviceId or ?meetingsEnabled. Numbers are masked.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        meetingsEnabled: {
          type: 'string'
        }
      }
    }
  },
  {
    name: 'get_contact_preferences',
    method: 'get',
    path: '/preferences/:audienceId',
    scope: 'audiences:read',
    summary:
      "One guest's contact consent flags, by audience id.",
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'update_contact_preferences',
    method: 'put',
    path: '/preferences/:audienceId',
    scope: 'audiences:write',
    summary:
      "Set a guest's consent flags (email, linkedin, whatsapp, phone, meetingsEnabled, linkedinUrl). Writes nothing else on the record.",
    input: {
      type: 'object',
      properties: {
        audienceId: {
          type: 'string'
        },
        email: {
          type: 'boolean'
        },
        linkedin: {
          type: 'boolean'
        },
        whatsapp: {
          type: 'boolean'
        },
        phone: {
          type: 'boolean'
        },
        meetingsEnabled: {
          type: 'boolean'
        },
        linkedinUrl: {
          type: 'string'
        }
      },
      required: ['audienceId']
    }
  },
  {
    name: 'list_reminders',
    method: 'get',
    path: '/reminders',
    scope: 'reminders:read',
    summary:
      "List the organization's reminders, archived ones excluded.",
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        }
      }
    }
  },
  {
    name: 'get_reminder',
    method: 'get',
    path: '/reminders/:reminderId',
    scope: 'reminders:read',
    summary:
      'One reminder, by reminderId.',
    input: {
      type: 'object',
      properties: {
        reminderId: {
          type: 'string'
        }
      },
      required: ['reminderId']
    }
  },
  {
    name: 'create_reminder',
    method: 'post',
    path: '/reminders',
    scope: 'reminders:write',
    summary:
      'Create a reminder. It schedules a message to an audience, and the send happens later in the scheduler, outside this key and its daily send budget.',
    input: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        reminderType: {
          type: 'string'
        },
        triggerType: {
          type: 'string'
        },
        triggerValue: {
          type: 'number'
        },
        triggerDatetime: {
          type: 'string'
        },
        sendTime: {
          type: 'object'
        },
        timezone: {
          type: 'string'
        },
        sessionIndex: {
          type: 'number'
        },
        templateId: {
          type: 'string'
        },
        messageBody: {
          type: 'string'
        },
        messageLanguage: {
          type: 'string'
        },
        audienceGroupIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        maxRetries: {
          type: 'number'
        }
      },
      required: ['customerId', 'serviceId', 'name', 'reminderType', 'triggerType', 'audienceGroupIds']
    }
  },
  {
    name: 'update_reminder',
    method: 'put',
    path: '/reminders/:reminderId',
    scope: 'reminders:write',
    summary:
      'Update a reminder.',
    input: {
      type: 'object',
      properties: {
        reminderId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        reminderType: {
          type: 'string'
        },
        triggerType: {
          type: 'string'
        },
        triggerValue: {
          type: 'number'
        },
        triggerDatetime: {
          type: 'string'
        },
        sendTime: {
          type: 'object'
        },
        timezone: {
          type: 'string'
        },
        sessionIndex: {
          type: 'number'
        },
        templateId: {
          type: 'string'
        },
        messageBody: {
          type: 'string'
        },
        messageLanguage: {
          type: 'string'
        },
        audienceGroupIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        maxRetries: {
          type: 'number'
        }
      },
      required: ['reminderId']
    }
  },
  {
    name: 'enable_reminder',
    method: 'post',
    path: '/reminders/:reminderId/enable',
    scope: 'reminders:write',
    summary:
      'Turn a reminder on. The scheduler sends only when it is ACTIVE and enabled.',
    input: {
      type: 'object',
      properties: {
        reminderId: {
          type: 'string'
        }
      },
      required: ['reminderId']
    }
  },
  {
    name: 'disable_reminder',
    method: 'post',
    path: '/reminders/:reminderId/disable',
    scope: 'reminders:write',
    summary:
      'Turn a reminder off without deleting it.',
    input: {
      type: 'object',
      properties: {
        reminderId: {
          type: 'string'
        }
      },
      required: ['reminderId']
    }
  },
  {
    name: 'delete_reminder',
    method: 'delete',
    path: '/reminders/:reminderId',
    scope: 'reminders:write',
    summary:
      'Delete a reminder.',
    input: {
      type: 'object',
      properties: {
        reminderId: {
          type: 'string'
        }
      },
      required: ['reminderId']
    }
  },
  {
    name: 'create_survey',
    method: 'post',
    path: '/surveys',
    scope: 'surveys:write',
    summary:
      'Create a survey with its questions. Created as a draft unless a status is given; creating one never sends it.',
    input: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        headerImageUrl: {
          type: 'string'
        },
        initialText: {
          type: 'string'
        },
        startDate: {
          type: 'string'
        },
        endDate: {
          type: 'string'
        },
        endTime: {
          type: 'string'
        },
        timeZone: {
          type: 'string'
        },
        languageCode: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        status: {
          type: 'string'
        },
        questions: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        isPreferencesSurvey: {
          type: 'boolean'
        },
        triggerKeywords: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        trendCadence: {
          type: 'string'
        }
      },
      required: ['serviceId', 'name', 'questions']
    }
  },
  {
    name: 'update_survey',
    method: 'put',
    path: '/surveys/:surveyId',
    scope: 'surveys:write',
    summary:
      'Update a survey and its questions.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        },
        serviceId: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        headerImageUrl: {
          type: 'string'
        },
        initialText: {
          type: 'string'
        },
        startDate: {
          type: 'string'
        },
        endDate: {
          type: 'string'
        },
        endTime: {
          type: 'string'
        },
        timeZone: {
          type: 'string'
        },
        languageCode: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        status: {
          type: 'string'
        },
        questions: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        isPreferencesSurvey: {
          type: 'boolean'
        },
        triggerKeywords: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        trendCadence: {
          type: 'string'
        }
      },
      required: ['surveyId']
    }
  },
  {
    name: 'delete_survey',
    method: 'delete',
    path: '/surveys/:surveyId',
    scope: 'surveys:write',
    summary:
      'Delete a survey.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        }
      },
      required: ['surveyId']
    }
  },
  {
    name: 'set_survey_status',
    method: 'put',
    path: '/surveys/:surveyId/status',
    scope: 'surveys:write',
    summary:
      'Move a survey between draft, scheduled, active and closed.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        },
        status: {
          type: 'string'
        }
      },
      required: ['surveyId', 'status']
    }
  },
  {
    name: 'get_survey_statistics',
    method: 'get',
    path: '/surveys/statistics',
    scope: 'results:read',
    summary:
      "Counts across the organization's surveys and responses. Aggregate only; no respondent is identified.",
    input: NO_INPUT
  },
  {
    name: 'list_survey_responses',
    method: 'get',
    path: '/surveys/:surveyId/responses',
    scope: 'results:export',
    summary:
      'Individual survey responses. Numbers are masked to the last four digits; the raw number, the audience link and the untranslated original text are never returned.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        }
      },
      required: ['surveyId']
    }
  },
  {
    name: 'export_survey_responses',
    method: 'get',
    path: '/surveys/:surveyId/responses/export',
    scope: 'results:export',
    summary:
      'The same per-respondent rows as CSV, with the same masking. There is no raw-number export.',
    input: {
      type: 'object',
      properties: {
        surveyId: {
          type: 'string'
        }
      },
      required: ['surveyId']
    }
  }
];

export function findTool(name: string): AgentTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/** Tools this key may actually call, given the scopes it holds. */
export function toolsForScopes(granted: string[]): AgentTool[] {
  const all = granted.includes('*');
  return TOOLS.filter(
    (tool) => tool.scope === null || all || granted.includes(tool.scope)
  );
}

/**
 * Compare this package's catalog with what the server advertises. Returns the
 * names each side has and the other does not, so a skin can say "your toolkit
 * is older than the gateway" instead of failing on an unknown tool later.
 */
export function catalogMatches(serverToolNames: string[]): {
  matches: boolean;
  missingLocally: string[];
  missingOnServer: string[];
} {
  const local = new Set(TOOLS.map((t) => t.name));
  const remote = new Set(serverToolNames);
  const missingLocally = [...remote].filter((n) => !local.has(n));
  const missingOnServer = [...local].filter((n) => !remote.has(n));
  return {
    matches: missingLocally.length === 0 && missingOnServer.length === 0,
    missingLocally,
    missingOnServer
  };
}
