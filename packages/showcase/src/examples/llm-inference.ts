/**
 * Teaching story for decoder-only inference: tokenizer, causal prefill, logits and KV-cached decode.
 * The circles represent per-position state vectors at a layer, not neurons or model weights.
 * Source adaptation: reviewed offline diagram `llm-inference-complete`, revision v004.
 */
import type { DiagramDocument } from "flowsvg";
import type { ShowcaseAuthorDefinition } from "../model.js";

const document: DiagramDocument = {
  "version": 1,
  "title": "How an LLM generates the next token",
  "theme": "light",
  "viewport": {
    "width": 1120,
    "height": 760
  },
  "typography": {
    "nodeLabel": 20,
    "edgeLabel": 17,
    "flowLabel": 16
  },
  "nodes": [
    {
      "id": "title",
      "kind": "rect",
      "x": 46,
      "y": 20,
      "width": 930,
      "height": 45,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "How an LLM generates the next token",
            "style": {
              "fontSize": 30
            }
          }
        ]
      }
    },
    {
      "id": "subtitle",
      "kind": "rect",
      "x": 48,
      "y": 72,
      "width": 1030,
      "height": 30,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Decoder-only Transformer · Single-request inference loop (teaching diagram)",
            "style": {
              "fontSize": 18
            }
          }
        ]
      }
    },
    {
      "id": "h_token",
      "kind": "rect",
      "x": 49,
      "y": 126,
      "width": 160,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Input tokens",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "h1",
      "kind": "rect",
      "x": 213,
      "y": 126,
      "width": 124,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Layer 1",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "h2",
      "kind": "rect",
      "x": 383,
      "y": 126,
      "width": 124,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Layer 2",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "h3",
      "kind": "rect",
      "x": 553,
      "y": 126,
      "width": 124,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Layer k",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "h4",
      "kind": "rect",
      "x": 723,
      "y": 126,
      "width": 124,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Layer N",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "h_output",
      "kind": "rect",
      "x": 910,
      "y": 126,
      "width": 165,
      "height": 38,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Next token",
            "style": {
              "fontSize": 19
            }
          }
        ]
      }
    },
    {
      "id": "rule",
      "kind": "rect",
      "x": 49,
      "y": 172,
      "width": 1020,
      "height": 30,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Each layer: causal attention + FFN; circles = position state vectors, not neurons or weights",
            "style": {
              "fontSize": 16
            }
          }
        ]
      }
    },
    {
      "id": "t1",
      "kind": "roundedRect",
      "x": 62,
      "y": 209,
      "width": 76,
      "height": 52,
      "label": "I"
    },
    {
      "id": "a11",
      "kind": "ellipse",
      "x": 257,
      "y": 217,
      "width": 36,
      "height": 36
    },
    {
      "id": "a21",
      "kind": "ellipse",
      "x": 427,
      "y": 217,
      "width": 36,
      "height": 36
    },
    {
      "id": "a31",
      "kind": "ellipse",
      "x": 597,
      "y": 217,
      "width": 36,
      "height": 36
    },
    {
      "id": "a41",
      "kind": "ellipse",
      "x": 767,
      "y": 217,
      "width": 36,
      "height": 36
    },
    {
      "id": "t2",
      "kind": "roundedRect",
      "x": 62,
      "y": 289,
      "width": 76,
      "height": 52,
      "label": "want"
    },
    {
      "id": "a12",
      "kind": "ellipse",
      "x": 257,
      "y": 297,
      "width": 36,
      "height": 36
    },
    {
      "id": "a22",
      "kind": "ellipse",
      "x": 427,
      "y": 297,
      "width": 36,
      "height": 36
    },
    {
      "id": "a32",
      "kind": "ellipse",
      "x": 597,
      "y": 297,
      "width": 36,
      "height": 36
    },
    {
      "id": "a42",
      "kind": "ellipse",
      "x": 767,
      "y": 297,
      "width": 36,
      "height": 36
    },
    {
      "id": "t3",
      "kind": "roundedRect",
      "x": 62,
      "y": 369,
      "width": 76,
      "height": 52,
      "label": "eat"
    },
    {
      "id": "a13",
      "kind": "ellipse",
      "x": 257,
      "y": 377,
      "width": 36,
      "height": 36
    },
    {
      "id": "a23",
      "kind": "ellipse",
      "x": 427,
      "y": 377,
      "width": 36,
      "height": 36
    },
    {
      "id": "a33",
      "kind": "ellipse",
      "x": 597,
      "y": 377,
      "width": 36,
      "height": 36
    },
    {
      "id": "a43",
      "kind": "ellipse",
      "x": 767,
      "y": 377,
      "width": 36,
      "height": 36
    },
    {
      "id": "t4",
      "kind": "roundedRect",
      "x": 62,
      "y": 449,
      "width": 76,
      "height": 52
    },
    {
      "id": "a14",
      "kind": "ellipse",
      "x": 257,
      "y": 457,
      "width": 36,
      "height": 36,
      "visible": false
    },
    {
      "id": "a24",
      "kind": "ellipse",
      "x": 427,
      "y": 457,
      "width": 36,
      "height": 36,
      "visible": false
    },
    {
      "id": "a34",
      "kind": "ellipse",
      "x": 597,
      "y": 457,
      "width": 36,
      "height": 36,
      "visible": false
    },
    {
      "id": "a44",
      "kind": "ellipse",
      "x": 767,
      "y": 457,
      "width": 36,
      "height": 36,
      "visible": false
    },
    {
      "id": "h_cache",
      "kind": "rect",
      "x": 47,
      "y": 558,
      "width": 177,
      "height": 32,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Layered KV cache",
            "style": {
              "fontSize": 18
            }
          }
        ]
      }
    },
    {
      "id": "cache1",
      "kind": "roundedRect",
      "x": 210,
      "y": 603,
      "width": 130,
      "height": 65,
      "label": "L1  0 positions"
    },
    {
      "id": "cache2",
      "kind": "roundedRect",
      "x": 380,
      "y": 603,
      "width": 130,
      "height": 65,
      "label": "L2  0 positions"
    },
    {
      "id": "cache3",
      "kind": "roundedRect",
      "x": 550,
      "y": 603,
      "width": 130,
      "height": 65,
      "label": "Lk  0 positions"
    },
    {
      "id": "cache4",
      "kind": "roundedRect",
      "x": 720,
      "y": 603,
      "width": 130,
      "height": 65,
      "label": "LN  0 positions"
    },
    {
      "id": "cache_note",
      "kind": "rect",
      "x": 45,
      "y": 687,
      "width": 1034,
      "height": 27,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Each cell stores one position's K/V. New rounds append cells; reads grow with history.",
            "style": {
              "fontSize": 15
            }
          }
        ]
      }
    },
    {
      "id": "lm",
      "kind": "roundedRect",
      "x": 932,
      "y": 232,
      "width": 113,
      "height": 52,
      "label": "LM head"
    },
    {
      "id": "score_note",
      "kind": "rect",
      "x": 906,
      "y": 556,
      "width": 180,
      "height": 30,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Candidates",
            "style": {
              "fontSize": 14
            }
          }
        ]
      }
    },
    {
      "id": "bar1",
      "kind": "roundedRect",
      "x": 932,
      "y": 316,
      "width": 151,
      "height": 50,
      "label": "noodles",
      "visible": false
    },
    {
      "id": "bar2",
      "kind": "roundedRect",
      "x": 932,
      "y": 376,
      "width": 96,
      "height": 50,
      "label": "rice",
      "visible": false
    },
    {
      "id": "bar3",
      "kind": "roundedRect",
      "x": 932,
      "y": 436,
      "width": 62,
      "height": 50,
      "label": "dish",
      "visible": false
    },
    {
      "id": "footer",
      "kind": "rect",
      "x": 45,
      "y": 718,
      "width": 1035,
      "height": 27,
      "content": {
        "style": {
          "padding": 0,
          "blockGap": 4
        },
        "blocks": [
          {
            "type": "paragraph",
            "text": "Token boundaries and scores are illustrative; the tokenizer and model define them.",
            "style": {
              "fontSize": 15
            }
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "p1_1_1",
      "from": "t1",
      "to": "a11",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p1_1_2",
      "from": "t1",
      "to": "a12",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p1_1_3",
      "from": "t1",
      "to": "a13",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p1_2_2",
      "from": "t2",
      "to": "a12",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p1_2_3",
      "from": "t2",
      "to": "a13",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p1_3_3",
      "from": "t3",
      "to": "a13",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_1_1",
      "from": "a11",
      "to": "a21",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_1_2",
      "from": "a11",
      "to": "a22",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_1_3",
      "from": "a11",
      "to": "a23",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_2_2",
      "from": "a12",
      "to": "a22",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_2_3",
      "from": "a12",
      "to": "a23",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p2_3_3",
      "from": "a13",
      "to": "a23",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_1_1",
      "from": "a21",
      "to": "a31",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_1_2",
      "from": "a21",
      "to": "a32",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_1_3",
      "from": "a21",
      "to": "a33",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_2_2",
      "from": "a22",
      "to": "a32",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_2_3",
      "from": "a22",
      "to": "a33",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p3_3_3",
      "from": "a23",
      "to": "a33",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_1_1",
      "from": "a31",
      "to": "a41",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_1_2",
      "from": "a31",
      "to": "a42",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_1_3",
      "from": "a31",
      "to": "a43",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_2_2",
      "from": "a32",
      "to": "a42",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_2_3",
      "from": "a32",
      "to": "a43",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "p4_3_3",
      "from": "a33",
      "to": "a43",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "new1",
      "from": "t4",
      "to": "a14",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      },
      "visible": false
    },
    {
      "id": "new2",
      "from": "a14",
      "to": "a24",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      },
      "visible": false
    },
    {
      "id": "new3",
      "from": "a24",
      "to": "a34",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      },
      "visible": false
    },
    {
      "id": "new4",
      "from": "a34",
      "to": "a44",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      },
      "visible": false
    },
    {
      "id": "read1",
      "from": "cache1",
      "to": "a14",
      "fromPort": "top",
      "toPort": "bottom",
      "route": "straight",
      "style": {
        "dashed": true
      },
      "visible": false
    },
    {
      "id": "read2",
      "from": "cache2",
      "to": "a24",
      "fromPort": "top",
      "toPort": "bottom",
      "route": "straight",
      "style": {
        "dashed": true
      },
      "visible": false
    },
    {
      "id": "read3",
      "from": "cache3",
      "to": "a34",
      "fromPort": "top",
      "toPort": "bottom",
      "route": "straight",
      "style": {
        "dashed": true
      },
      "visible": false
    },
    {
      "id": "read4",
      "from": "cache4",
      "to": "a44",
      "fromPort": "top",
      "toPort": "bottom",
      "route": "straight",
      "style": {
        "dashed": true
      },
      "visible": false
    },
    {
      "id": "logits",
      "from": "a43",
      "to": "lm",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      }
    },
    {
      "id": "nextlogits",
      "from": "a44",
      "to": "lm",
      "fromPort": "right",
      "toPort": "left",
      "route": "straight",
      "style": {
        "dashed": false
      },
      "visible": false
    }
  ],
  "scenes": [
    {
      "id": "s1",
      "label": "From text to tokens",
      "beats": [
        {
          "durationMs": 2300,
          "caption": "Example: treat “I want to eat” as three tokens; actual segmentation depends on the tokenizer.",
          "actions": []
        },
        {
          "durationMs": 2150,
          "caption": "Input tokens enter through embeddings and positional information; each circle is a full state vector for one position, not a neuron or a weight.",
          "actions": [
            {
              "type": "highlight",
              "target": "t1"
            },
            {
              "type": "highlight",
              "target": "t2"
            },
            {
              "type": "highlight",
              "target": "t3"
            }
          ]
        },
        {
          "durationMs": 1600,
          "caption": "Columns run left to right as layer order; many layers are omitted between Layer 2 and Layer k, and between Layer k and Layer N.",
          "actions": [
            {
              "type": "unhighlight",
              "target": "t1"
            },
            {
              "type": "unhighlight",
              "target": "t2"
            },
            {
              "type": "unhighlight",
              "target": "t3"
            }
          ]
        }
      ]
    },
    {
      "id": "s2",
      "label": "Prefill · Causal attention",
      "beats": [
        {
          "durationMs": 1600,
          "caption": "Layer 1: position i reads only positions 1…i; the three positions can be computed in parallel within this layer.",
          "actions": [
            {
              "type": "flow",
              "target": "p1_1_1",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p1_1_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p1_1_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p1_2_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p1_2_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p1_3_3",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 880,
          "caption": "Layer 1 stores K/V for each position; future tokens cannot affect earlier positions.",
          "actions": [
            {
              "type": "updateNode",
              "target": "cache1",
              "value": {
                "label": "L1  3 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1600,
          "caption": "Layer 2: position i reads only positions 1…i; the three positions can be computed in parallel within this layer.",
          "actions": [
            {
              "type": "flow",
              "target": "p2_1_1",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p2_1_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p2_1_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p2_2_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p2_2_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p2_3_3",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 880,
          "caption": "Layer 2 stores K/V for each position; future tokens cannot affect earlier positions.",
          "actions": [
            {
              "type": "updateNode",
              "target": "cache2",
              "value": {
                "label": "L2  3 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1600,
          "caption": "Layer k: position i reads only positions 1…i; the three positions can be computed in parallel within this layer.",
          "actions": [
            {
              "type": "flow",
              "target": "p3_1_1",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p3_1_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p3_1_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p3_2_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p3_2_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p3_3_3",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 880,
          "caption": "Layer k stores K/V for each position; future tokens cannot affect earlier positions.",
          "actions": [
            {
              "type": "updateNode",
              "target": "cache3",
              "value": {
                "label": "Lk  3 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1600,
          "caption": "Layer N: position i reads only positions 1…i; the three positions can be computed in parallel within this layer.",
          "actions": [
            {
              "type": "flow",
              "target": "p4_1_1",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p4_1_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p4_1_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p4_2_2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p4_2_3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "p4_3_3",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 880,
          "caption": "Layer N stores K/V for each position; future tokens cannot affect earlier positions.",
          "actions": [
            {
              "type": "updateNode",
              "target": "cache4",
              "value": {
                "label": "LN  3 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1900,
          "caption": "Prefill complete: every layer has K/V for three positions, ready for reuse during decoding.",
          "actions": []
        }
      ]
    },
    {
      "id": "s3",
      "label": "From states to candidates",
      "beats": [
        {
          "durationMs": 1800,
          "caption": "Only the final state at the last input position, “eat”, goes through the LM head to score every token in the vocabulary.",
          "actions": [
            {
              "type": "flow",
              "target": "logits",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 1800,
          "caption": "Softmax turns scores into probabilities; these three candidates and bar lengths are illustrative, not measured probabilities.",
          "actions": [
            {
              "type": "show",
              "target": "bar1"
            },
            {
              "type": "show",
              "target": "bar2"
            },
            {
              "type": "show",
              "target": "bar3"
            }
          ]
        },
        {
          "durationMs": 2200,
          "caption": "This example selects “noodles” by highest probability; sampling may choose another token.",
          "actions": [
            {
              "type": "highlight",
              "target": "bar1"
            }
          ]
        }
      ]
    },
    {
      "id": "s4",
      "label": "Decode · Reuse the cache layer by layer",
      "beats": [
        {
          "durationMs": 2300,
          "caption": "Decode: the selected token “noodles” is appended. Historical positions stay fixed; only the new position is processed.",
          "actions": [
            {
              "type": "unhighlight",
              "target": "bar1"
            },
            {
              "type": "updateNode",
              "target": "t4",
              "value": {
                "label": "noodles"
              }
            },
            {
              "type": "hide",
              "target": "logits"
            },
            {
              "type": "hide",
              "target": "bar1"
            },
            {
              "type": "hide",
              "target": "bar2"
            },
            {
              "type": "hide",
              "target": "bar3"
            },
            {
              "type": "updateNode",
              "target": "score_note",
              "value": {
                "content": {
                  "style": {
                    "padding": 0,
                    "blockGap": 4
                  },
                  "blocks": [
                    {
                      "type": "paragraph",
                      "text": "Next token",
                      "style": {
                        "fontSize": 16
                      }
                    }
                  ]
                }
              }
            },
            {
              "type": "hide",
              "target": "p1_1_1"
            },
            {
              "type": "hide",
              "target": "p1_1_2"
            },
            {
              "type": "hide",
              "target": "p1_1_3"
            },
            {
              "type": "hide",
              "target": "p1_2_2"
            },
            {
              "type": "hide",
              "target": "p1_2_3"
            },
            {
              "type": "hide",
              "target": "p1_3_3"
            },
            {
              "type": "hide",
              "target": "p2_1_1"
            },
            {
              "type": "hide",
              "target": "p2_1_2"
            },
            {
              "type": "hide",
              "target": "p2_1_3"
            },
            {
              "type": "hide",
              "target": "p2_2_2"
            },
            {
              "type": "hide",
              "target": "p2_2_3"
            },
            {
              "type": "hide",
              "target": "p2_3_3"
            },
            {
              "type": "hide",
              "target": "p3_1_1"
            },
            {
              "type": "hide",
              "target": "p3_1_2"
            },
            {
              "type": "hide",
              "target": "p3_1_3"
            },
            {
              "type": "hide",
              "target": "p3_2_2"
            },
            {
              "type": "hide",
              "target": "p3_2_3"
            },
            {
              "type": "hide",
              "target": "p3_3_3"
            },
            {
              "type": "hide",
              "target": "p4_1_1"
            },
            {
              "type": "hide",
              "target": "p4_1_2"
            },
            {
              "type": "hide",
              "target": "p4_1_3"
            },
            {
              "type": "hide",
              "target": "p4_2_2"
            },
            {
              "type": "hide",
              "target": "p4_2_3"
            },
            {
              "type": "hide",
              "target": "p4_3_3"
            },
            {
              "type": "show",
              "target": "a14"
            },
            {
              "type": "show",
              "target": "a24"
            },
            {
              "type": "show",
              "target": "a34"
            },
            {
              "type": "show",
              "target": "a44"
            },
            {
              "type": "show",
              "target": "new1"
            },
            {
              "type": "show",
              "target": "new2"
            },
            {
              "type": "show",
              "target": "new3"
            },
            {
              "type": "show",
              "target": "new4"
            },
            {
              "type": "updateNode",
              "target": "a11",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a12",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a13",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a21",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a22",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a23",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a31",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a32",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a33",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a41",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a42",
              "value": {}
            },
            {
              "type": "updateNode",
              "target": "a43",
              "value": {}
            }
          ]
        },
        {
          "durationMs": 1950,
          "caption": "Layer 1: the new position brings its current state and reads historical K/V from this layer; only the new position is computed.",
          "actions": [
            {
              "type": "show",
              "target": "read1"
            },
            {
              "type": "flow",
              "target": "new1",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "read1",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 820,
          "caption": "Append the new position's Layer 1 K/V to that layer's cache.",
          "actions": [
            {
              "type": "hide",
              "target": "read1"
            },
            {
              "type": "updateNode",
              "target": "cache1",
              "value": {
                "label": "L1  4 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1950,
          "caption": "Layer 2: the new position brings its current state and reads historical K/V from this layer; only the new position is computed.",
          "actions": [
            {
              "type": "show",
              "target": "read2"
            },
            {
              "type": "flow",
              "target": "new2",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "read2",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 820,
          "caption": "Append the new position's Layer 2 K/V to that layer's cache.",
          "actions": [
            {
              "type": "hide",
              "target": "read2"
            },
            {
              "type": "updateNode",
              "target": "cache2",
              "value": {
                "label": "L2  4 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1950,
          "caption": "Layer k: the new position brings its current state and reads historical K/V from this layer; only the new position is computed.",
          "actions": [
            {
              "type": "show",
              "target": "read3"
            },
            {
              "type": "flow",
              "target": "new3",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "read3",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 820,
          "caption": "Append the new position's Layer k K/V to that layer's cache.",
          "actions": [
            {
              "type": "hide",
              "target": "read3"
            },
            {
              "type": "updateNode",
              "target": "cache3",
              "value": {
                "label": "Lk  4 positions"
              }
            }
          ]
        },
        {
          "durationMs": 1950,
          "caption": "Layer N: the new position brings its current state and reads historical K/V from this layer; only the new position is computed.",
          "actions": [
            {
              "type": "show",
              "target": "read4"
            },
            {
              "type": "flow",
              "target": "new4",
              "direction": "forward",
              "highlightParticipants": false
            },
            {
              "type": "flow",
              "target": "read4",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 820,
          "caption": "Append the new position's Layer N K/V to that layer's cache.",
          "actions": [
            {
              "type": "hide",
              "target": "read4"
            },
            {
              "type": "updateNode",
              "target": "cache4",
              "value": {
                "label": "LN  4 positions"
              }
            }
          ]
        }
      ]
    },
    {
      "id": "s5",
      "label": "Continue generation",
      "beats": [
        {
          "durationMs": 2600,
          "caption": "After Layer N produces the final state for “noodles”, the LM head predicts the next token; the loop continues until a stop condition.",
          "actions": [
            {
              "type": "show",
              "target": "nextlogits"
            },
            {
              "type": "flow",
              "target": "nextlogits",
              "direction": "forward",
              "highlightParticipants": false
            }
          ]
        },
        {
          "durationMs": 2600,
          "caption": "Each round processes only the new token; historical K/V are reused at every layer. More generated tokens mean a longer history to read.",
          "actions": []
        }
      ]
    }
  ]
};

/** A self-contained inference walkthrough with explicit prefill and decode stages. */
export const llmInferenceExample: ShowcaseAuthorDefinition = {
  id: "llm-inference",
  category: "workflow",
  name: "LLM inference: Prefill, decode and KV cache",
  introduction: "Follow one request from tokenization through causal prefill, next-token selection and layer-by-layer decode. The story distinguishes parallel input processing from single-token generation and shows why historical K/V values can be reused.",
  document,
  defaults: { speed: 1, theme: "dark", reducedMotion: false }
};
