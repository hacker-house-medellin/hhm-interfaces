#!/usr/bin/env python3
import unittest

from scripts.validate_schemas import structural_check


def messages_for(doc):
    problems = []
    structural_check(doc, "fixture.json", problems)
    return [problem.message for problem in problems]


class StructuralCheckTests(unittest.TestCase):
    def test_property_names_that_match_keywords_are_not_keywords(self):
        doc = {
            "type": "object",
            "properties": {
                "type": {"$ref": "#/$defs/scalarType"},
                "required": {"type": "boolean", "default": True},
            },
            "$defs": {
                "scalarType": {"type": "string"},
            },
        }
        self.assertEqual(messages_for(doc), [])

    def test_rejects_invalid_type_on_root_schema(self):
        messages = messages_for({"type": {"type": "string"}})
        self.assertIn("'type' must be a string or array", messages)

    def test_rejects_invalid_type_on_nested_property_schema(self):
        messages = messages_for({
            "type": "object",
            "properties": {"value": {"type": {"type": "string"}}},
        })
        self.assertIn("'type' must be a string or array", messages)

    def test_rejects_invalid_required_in_composed_schema(self):
        messages = messages_for({
            "allOf": [{"type": "object", "required": {"value": True}}],
        })
        self.assertIn("'required' must be a list", messages)


if __name__ == "__main__":
    unittest.main()
