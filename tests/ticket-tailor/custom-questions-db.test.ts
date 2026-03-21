import { describe, expect, it } from "vitest"

describe("Ticket Tailor custom questions - ACTUAL API response inspection", () => {
  describe("real API response structure from Ticket Tailor", () => {
    it("shows actual buyer_details.custom_questions structure", () => {
      const realBuyerDetails = {
        address: {
          address_1: null,
          address_2: null,
          address_3: null,
          postal_code: null,
        },
        custom_questions: [
          {
            answer: null,
            question: "Any remarks?",
          },
          {
            answer: "Clinton",
            question: "First name",
          },
          {
            answer: "Emok",
            question: "Last name",
          },
          {
            answer: "Eindhoven",
            question: "What location are you from?",
          },
        ],
        email: "clintonneemok11@gmail.com",
        first_name: "Clinton",
        last_name: "Emok",
        name: "Clinton Emok",
        phone: null,
      }

      const customQuestions = realBuyerDetails.custom_questions as Array<{
        question: string
        answer: string | null
      }>

      expect(customQuestions).toHaveLength(4)
      expect(customQuestions.find((q) => q.question === "First name")?.answer).toBe("Clinton")
      expect(customQuestions.find((q) => q.question === "What location are you from?")?.answer).toBe("Eindhoven")
    })

    it("shows actual issued_ticket.custom_questions structure", () => {
      const realIssuedTicket = {
        object: "issued_ticket",
        id: "it_118999934",
        barcode: "5v98QBh",
        checked_in: "false",
        created_at: 1773914290,
        custom_questions: [
          {
            answer: "Eindhoven",
            question: "What location are you from?",
          },
        ],
        description: "[TEST ORDER – NOT VALID] Private room",
        email: "clintonneemok11@gmail.com",
        event_id: "ev_7839152",
        first_name: "Clinton",
        full_name: "Clinton Emok",
        last_name: "Emok",
        listed_price: 35000,
        order_id: "or_73059853",
        status: "valid",
        ticket_type_id: "tt_6144896",
        updated_at: 1773914290,
      }

      const customQuestions = realIssuedTicket.custom_questions as Array<{
        question: string
        answer: string | null
      }>

      expect(customQuestions).toHaveLength(1)
      expect(customQuestions[0].question).toBe("What location are you from?")
      expect(customQuestions[0].answer).toBe("Eindhoven")
    })

    it("shows complete order payload with multiple tickets and custom questions", () => {
      const realOrderPayload = {
        object: "order",
        id: "or_73084872",
        buyer_details: {
          custom_questions: [
            { answer: null, question: "Any remarks?" },
            { answer: "Cath", question: "First name" },
            { answer: "Emaspa", question: "Last name" },
            { answer: "Amsterdam", question: "What location are you from?" },
            { answer: "Ben", question: "First name" },
            { answer: "Emaspa", question: "Last name" },
            { answer: "Amsterdam", question: "What location are you from?" },
            { answer: "Blas", question: "First name" },
            { answer: "Emaspa", question: "Last name" },
            { answer: null, question: "What location are you from?" },
          ],
          email: "clintonneemok11+g@gmail.com",
          first_name: "Cath",
          last_name: "Emaspa",
          name: "Cath Emaspa",
        },
        created_at: 1773944245,
        currency: { base_multiplier: 100, code: "eur" },
        event_summary: {
          id: "ev_7839152",
          name: "Divine Redesign Conference Draft",
        },
        issued_tickets: [
          {
            id: "it_119049743",
            full_name: "Cath Emaspa",
            custom_questions: [{ answer: "Amsterdam", question: "What location are you from?" }],
            ticket_type_id: "tt_6144904",
          },
          {
            id: "it_119049744",
            full_name: "Ben Emaspa",
            custom_questions: [{ answer: "Amsterdam", question: "What location are you from?" }],
            ticket_type_id: "tt_6144904",
          },
          {
            id: "it_119049745",
            full_name: "Blas Emaspa",
            custom_questions: [{ answer: null, question: "What location are you from?" }],
            ticket_type_id: "tt_6144907",
          },
        ],
        status: "completed",
        total: 110000,
      }

      expect(realOrderPayload.issued_tickets).toHaveLength(3)

      const cathTicket = realOrderPayload.issued_tickets[0]
      const cathQuestions = cathTicket.custom_questions as Array<{ question: string; answer: string | null }>
      expect(cathQuestions.find((q) => q.question === "What location are you from?")?.answer).toBe("Amsterdam")

      const blasTicket = realOrderPayload.issued_tickets[2]
      const blasQuestions = blasTicket.custom_questions as Array<{ question: string; answer: string | null }>
      expect(blasQuestions.find((q) => q.question === "What location are you from?")?.answer).toBeNull()
    })
  })

  describe("how custom questions appear in rawPayload fields", () => {
    it("demonstrates extracting custom questions from stored rawPayload", () => {
      const attendeeRawPayload = {
        id: "it_118999934",
        full_name: "Clinton Emok",
        email: "clintonneemok11@gmail.com",
        custom_questions: [
          {
            answer: "Eindhoven",
            question: "What location are you from?",
          },
        ],
      }

      const questions = attendeeRawPayload.custom_questions as Array<{
        question: string
        answer: string | null
      }>

      const locationAnswer = questions.find((q) => q.question === "What location are you from?")?.answer
      expect(locationAnswer).toBe("Eindhoven")
    })

    it("demonstrates extracting buyer_details.custom_questions from order rawPayload", () => {
      const orderRawPayload = {
        id: "or_73084872",
        buyer_details: {
          custom_questions: [
            { answer: null, question: "Any remarks?" },
            { answer: "Cath", question: "First name" },
            { answer: "Emaspa", question: "Last name" },
            { answer: "Amsterdam", question: "What location are you from?" },
          ],
          email: "clintonneemok11+g@gmail.com",
          name: "Cath Emaspa",
        },
        issued_tickets: [
          {
            id: "it_119049743",
            custom_questions: [{ answer: "Amsterdam", question: "What location are you from?" }],
          },
        ],
      }

      const buyerQuestions = orderRawPayload.buyer_details.custom_questions as Array<{
        question: string
        answer: string | null
      }>

      expect(buyerQuestions.find((q) => q.question === "First name")?.answer).toBe("Cath")
      expect(buyerQuestions.find((q) => q.question === "What location are you from?")?.answer).toBe("Amsterdam")
    })
  })

  describe("database query patterns for custom questions", () => {
    it("shows how to query attendees with specific custom question answers", () => {
      const attendees = [
        {
          id: "it_119049743",
          name: "Cath Emaspa",
          rawPayload: {
            custom_questions: [{ answer: "Amsterdam", question: "What location are you from?" }],
          },
        },
        {
          id: "it_119049744",
          name: "Ben Emaspa",
          rawPayload: {
            custom_questions: [{ answer: "Amsterdam", question: "What location are you from?" }],
          },
        },
        {
          id: "it_119049745",
          name: "Blas Emaspa",
          rawPayload: {
            custom_questions: [{ answer: null, question: "What location are you from?" }],
          },
        },
      ]

      const fromAmsterdam = attendees.filter((a) => {
        const questions = a.rawPayload.custom_questions as Array<{ question: string; answer: string | null }>
        return questions.find((q) => q.question === "What location are you from?")?.answer === "Amsterdam"
      })

      expect(fromAmsterdam).toHaveLength(2)
      expect(fromAmsterdam.map((a) => a.name)).toEqual(["Cath Emaspa", "Ben Emaspa"])
    })

    it("shows how to aggregate custom question answers", () => {
      const attendees = [
        { name: "Cath", location: "Amsterdam" },
        { name: "Ben", location: "Amsterdam" },
        { name: "Blas", location: null },
        { name: "Tim", location: "Amsterdam" },
        { name: "Clinton", location: "Eindhoven" },
      ]

      const locations = attendees
        .map((a) => a.location)
        .filter((loc): loc is string => loc !== null)

      const locationCounts = locations.reduce(
        (acc, loc) => {
          acc[loc] = (acc[loc] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      expect(locationCounts).toEqual({
        Amsterdam: 3,
        Eindhoven: 1,
      })
    })
  })

  describe("IMPORTANT: Key differences from assumed structure", () => {
    it("clarifies that Ticket Tailor does NOT use question_id", () => {
      const realTicketQuestions = [
        { answer: "Eindhoven", question: "What location are you from?" },
      ]

      expect(realTicketQuestions[0]).toHaveProperty("question")
      expect(realTicketQuestions[0]).toHaveProperty("answer")
      expect(realTicketQuestions[0]).not.toHaveProperty("question_id")

      const realBuyerQuestions = [
        { answer: null, question: "Any remarks?" },
        { answer: "Clinton", question: "First name" },
      ]

      expect(realBuyerQuestions[0]).toHaveProperty("question")
      expect(realBuyerQuestions[0]).toHaveProperty("answer")
      expect(realBuyerQuestions[0]).not.toHaveProperty("question_id")
    })

    it("clarifies the two places custom questions appear", () => {
      const orderStructure = {
        buyer_details: {
          custom_questions: [
            { question: "First name", answer: "Admin" },
            { question: "Last name", answer: "Order" },
          ],
        },
        issued_tickets: [
          {
            id: "it_1",
            custom_questions: [
              { question: "What location are you from?", answer: "Eindhoven" },
            ],
          },
          {
            id: "it_2",
            custom_questions: [
              { question: "What location are you from?", answer: "Amsterdam" },
            ],
          },
        ],
      }

      expect(orderStructure.buyer_details.custom_questions).toHaveLength(2)
      expect(orderStructure.issued_tickets[0].custom_questions).toHaveLength(1)
      expect(orderStructure.issued_tickets[1].custom_questions).toHaveLength(1)
    })
  })
})
